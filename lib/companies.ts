import bcrypt from "bcryptjs";
import type { Company, Plan } from "@prisma/client";
import { prisma } from "./db";
import { DAY_MS, TRIAL_DAYS, appUrl } from "./config";
import { formatDate, formatMoney } from "./format";
import { createReseller, resellerLoginUrl, setResellerActive, updateReseller } from "./gpswox";
import { accessEndsAt, paidPeriod, reminderDue, shouldBlock } from "./lifecycle";
import { emailHtml, sendEmail, sendWhatsApp, type ChannelResult } from "./notify";

type CompanyWithPlan = Company & { plan: Plan };

export type RegisterInput = {
  name: string;
  slug: string;
  contactName: string;
  email: string;
  phone: string;
  password: string;
  planId: string;
};

export class RegistrationError extends Error {}

export async function registerCompany(input: RegisterInput, now = new Date()): Promise<CompanyWithPlan> {
  const plan = await prisma.plan.findFirst({ where: { id: input.planId, active: true } });
  if (!plan) throw new RegistrationError("Ese paquete no está disponible.");
  if (await prisma.company.findUnique({ where: { email: input.email } })) throw new RegistrationError("Ya existe una cuenta con ese correo.");
  if (await prisma.company.findUnique({ where: { slug: input.slug } })) throw new RegistrationError("Ese código de empresa ya está en uso. Elige otro.");

  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * DAY_MS);
  let gpswoxUserId: number;
  try {
    gpswoxUserId = await createReseller({ email: input.email, password: input.password, devicesLimit: plan.devices, expiresAt: trialEndsAt, phone: input.phone });
  } catch (error) {
    const message = (error as Error).message;
    console.error("[registro] GPSWOX:", message);
    if (/email/i.test(message)) throw new RegistrationError("Ese correo ya está registrado en la plataforma de rastreo. Usa otro correo o contáctanos.");
    throw new RegistrationError("No pudimos crear tu plataforma en este momento. Inténtalo de nuevo en unos minutos.");
  }

  const company = await prisma.company.create({
    data: {
      name: input.name,
      slug: input.slug,
      contactName: input.contactName,
      email: input.email,
      phone: input.phone,
      passwordHash: await bcrypt.hash(input.password, 10),
      planId: plan.id,
      trialEndsAt,
      gpswoxUserId,
    },
    include: { plan: true },
  });

  await notifyOnce(company, "welcome", `${company.id}:welcome`, {
    subject: `Bienvenido a GPS Link: tu prueba de ${TRIAL_DAYS} días está activa`,
    title: `¡Hola ${company.contactName}! Tu plataforma está lista`,
    lines: [
      `Tu paquete: ${plan.name} (${plan.devices} equipos GPS).`,
      `Tu prueba gratis termina el ${formatDate(trialEndsAt)}. No te pedimos tarjeta.`,
      `Entra a tu plataforma con tu correo y la contraseña que elegiste: ${resellerLoginUrl()}`,
      "Ahí puedes poner tu logo y colores, crear tus clientes y agregar sus equipos.",
    ],
    cta: { label: "Ver mi cuenta", url: `${appUrl()}/cuenta` },
  });
  return company;
}

export async function verifyCompanyLogin(email: string, password: string): Promise<Company | null> {
  const company = await prisma.company.findUnique({ where: { email } });
  if (!company) return null;
  return (await bcrypt.compare(password, company.passwordHash)) ? company : null;
}

type Message = { subject: string; title: string; lines: string[]; cta?: { label: string; url: string } };

// Each dedupeKey is sent at most once, so the daily job can run as often as needed.
export async function notifyOnce(company: Company, kind: string, dedupeKey: string, message: Message): Promise<boolean> {
  try {
    await prisma.notification.create({ data: { companyId: company.id, kind, dedupeKey, channels: "" } });
  } catch {
    return false;
  }
  const text = [message.title, ...message.lines, message.cta ? message.cta.url : ""].filter(Boolean).join("\n");
  const results: ChannelResult[] = await Promise.all([
    sendEmail(company.email, message.subject, emailHtml(message.title, message.lines, message.cta)),
    sendWhatsApp(company.phone, text),
  ]);
  await prisma.notification.update({
    where: { dedupeKey },
    data: {
      channels: results.filter((r) => r.ok).map((r) => r.channel).join(","),
      error: results.filter((r) => !r.ok).map((r) => `${r.channel}: ${r.error}`).join("; ") || null,
    },
  });
  return true;
}

export async function recordPayment(
  companyId: string,
  payment: { amountCents: number; currency: string; method: string; reference?: string; note?: string },
  now = new Date(),
): Promise<CompanyWithPlan> {
  if (payment.reference && (await prisma.payment.findUnique({ where: { reference: payment.reference } }))) {
    return prisma.company.findUniqueOrThrow({ where: { id: companyId }, include: { plan: true } });
  }
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, include: { plan: true } });
  const { start, end } = paidPeriod(company, now);
  if (company.gpswoxUserId) {
    await updateReseller(company.gpswoxUserId, company.email, { devicesLimit: company.plan.devices, expiresAt: end, active: true });
  }
  const [, updated] = await prisma.$transaction([
    prisma.payment.create({ data: { companyId, ...payment, periodStart: start, periodEnd: end } }),
    prisma.company.update({ where: { id: companyId }, data: { status: "ACTIVE", paidUntil: end }, include: { plan: true } }),
  ]);
  await notifyOnce(updated, "paid", `${companyId}:paid:${end.toISOString().slice(0, 10)}`, {
    subject: "Pago recibido: tu plataforma GPS Link está activa",
    title: "¡Gracias! Recibimos tu pago",
    lines: [
      `Monto: ${formatMoney(payment.amountCents, payment.currency)}.`,
      `Tu plataforma queda activa hasta el ${formatDate(end)}.`,
    ],
    cta: { label: "Ver mi cuenta", url: `${appUrl()}/cuenta` },
  });
  return updated;
}

export async function blockCompany(company: CompanyWithPlan, reason: "expired" | "manual") {
  if (company.gpswoxUserId) await setResellerActive(company.email, false);
  await prisma.company.update({ where: { id: company.id }, data: { status: "BLOCKED" } });
  if (reason === "expired") {
    await notifyOnce(company, "blocked", `${company.id}:blocked:${accessEndsAt(company).toISOString().slice(0, 10)}`, {
      subject: "Tu plataforma GPS Link fue bloqueada por falta de pago",
      title: "Tu plataforma está bloqueada",
      lines: [
        "Tu período terminó y no recibimos el pago del año.",
        "Tus clientes y equipos siguen guardados. Paga el año y se reactiva al momento.",
      ],
      cta: { label: "Pagar y reactivar", url: `${appUrl()}/cuenta` },
    });
  }
}

export async function unblockCompany(company: CompanyWithPlan) {
  if (company.gpswoxUserId) await setResellerActive(company.email, true);
  await prisma.company.update({ where: { id: company.id }, data: { status: company.paidUntil ? "ACTIVE" : "TRIAL" } });
}

export async function runDailyLifecycle(now = new Date()) {
  const companies = await prisma.company.findMany({ where: { status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } }, include: { plan: true } });
  const summary = { reminders: 0, blocked: 0, errors: 0 };
  for (const company of companies) {
    try {
      if (shouldBlock(company, now)) {
        await blockCompany(company, "expired");
        summary.blocked++;
        continue;
      }
      const days = reminderDue(company, now);
      if (days) {
        const end = accessEndsAt(company);
        const sent = await notifyOnce(company, `reminder_${days}`, `${company.id}:${end.toISOString().slice(0, 10)}:reminder_${days}`, {
          subject: `Tu plataforma GPS Link se bloquea en ${days} ${days === 1 ? "día" : "días"}`,
          title: `Te ${days === 1 ? "queda 1 día" : `quedan ${days} días`}`,
          lines: [
            `${company.status === "TRIAL" ? "Tu prueba gratis" : "Tu año pagado"} termina el ${formatDate(end)}.`,
            `Paga el año (${company.plan.name}: ${formatMoney(company.plan.priceCents, company.plan.currency)}) para que tu plataforma y tus clientes no se bloqueen.`,
          ],
          cta: { label: "Pagar el año", url: `${appUrl()}/cuenta` },
        });
        if (sent) summary.reminders++;
      }
    } catch (error) {
      summary.errors++;
      console.error(`[lifecycle] ${company.id}:`, (error as Error).message);
    }
  }
  return summary;
}
