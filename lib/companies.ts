import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Company, Plan } from "@prisma/client";
import { prisma } from "./db";
import { DAY_MS, RESELLER_OPEN_DAYS, TRIAL_DAYS, appUrl } from "./config";
import { closedPeriod, devicesToBill, unitPrice } from "./billing";
import { formatDate, formatMoney } from "./format";
import { brandChain, createReseller, deviceList, resellerLoginUrl, setResellerActive, updateReseller, userIdByEmail } from "./gpswox";
import { login as platformLogin, userInfo } from "./ai/gps";
import { runClientLifecycle } from "./clients";
import { plusOneYear, reminderDayFor } from "./lifecycle";
import { emailHtml, sendEmail, sendWhatsApp, type ChannelResult } from "./notify";

export type CompanyWithPlan = Company & { plan: Plan };

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
    gpswoxUserId = await createReseller({ email: input.email, password: input.password, devicesLimit: plan.devices, expiresAt: new Date(now.getTime() + RESELLER_OPEN_DAYS * DAY_MS), phone: input.phone });
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
      deviceLimit: plan.devices,
    },
    include: { plan: true },
  });

  await notifyOnce(company, "welcome", `${company.id}:welcome`, {
    subject: `Bienvenido a GPS Link: tienes ${TRIAL_DAYS} días gratis`,
    title: `¡Hola ${company.contactName}! Tu plataforma está lista`,
    lines: [
      `Tienes ${TRIAL_DAYS} días gratis, hasta el ${formatDate(trialEndsAt)}, con hasta ${plan.devices} equipos GPS. No te pedimos tarjeta.`,
      "Al terminar la prueba, a fin de cada mes te enviamos la factura de los equipos que subiste. Pagas del 1 al 15. Cada equipo se renueva a su año.",
      `Entra a tu plataforma con tu correo y la contraseña que elegiste: ${resellerLoginUrl()}`,
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

// White labels created by hand in GPSWOX (before the signup page) log in with their platform credentials.
// The first time, their account is created linked to their GPSWOX user, with billing off until the owner turns it on.
export async function verifyResellerLogin(email: string, password: string): Promise<Company | "not_reseller" | null> {
  const hash = await platformLogin(email, password).catch(() => null);
  if (!hash) return null;
  const info = await userInfo(hash).catch(() => null);
  const userId = info ? await userIdByEmail(info.email) : null;
  if (!info || !userId) return null;
  const linked = (await prisma.company.findFirst({ where: { gpswoxUserId: userId } })) ?? (await prisma.company.findUnique({ where: { email: info.email } }));
  if (linked) return linked.gpswoxUserId === userId ? linked : null;
  if (!(await brandChain(userId))[0]?.reseller) return "not_reseller";
  const plan = await prisma.plan.findFirst({ where: { active: true }, orderBy: { devices: "asc" } });
  if (!plan) return null;
  const base = info.email.split("@")[0].toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "marca";
  let slug = base;
  for (let i = 2; await prisma.company.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  const now = new Date();
  const company = await prisma.company.create({
    data: {
      name: base,
      slug,
      contactName: base,
      email: info.email,
      phone: "",
      passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10),
      planId: plan.id,
      status: "ACTIVE",
      trialEndsAt: now,
      gpswoxUserId: userId,
      billingEnabled: false,
    },
  });
  await syncDevices(company, now).catch((error) => console.error("[cuenta] equipos:", (error as Error).message));
  return company;
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


// Mirrors the devices found in GPSWOX. A new device is first billed when the trial ends (or the month it is added after that).
export async function syncDevices(company: Company, now = new Date()): Promise<void> {
  if (!company.gpswoxUserId) return;
  const found = await deviceList(company.gpswoxUserId);
  const known = new Map((await prisma.billedDevice.findMany({ where: { companyId: company.id } })).map((d) => [d.deviceId, d]));
  const present = new Set(found.map((d) => d.id));
  for (const d of found) {
    const row = known.get(d.id);
    if (!row) {
      const nextBillAt = d.createdAt > company.trialEndsAt ? d.createdAt : company.trialEndsAt;
      await prisma.billedDevice.create({ data: { companyId: company.id, deviceId: d.id, addedAt: d.createdAt, nextBillAt } });
    } else if (row.removedAt) {
      await prisma.billedDevice.update({ where: { id: row.id }, data: { removedAt: null } });
    }
  }
  for (const row of known.values()) {
    if (!row.removedAt && !present.has(row.deviceId)) await prisma.billedDevice.update({ where: { id: row.id }, data: { removedAt: now } });
  }
}

export async function setDeviceLimit(company: Company, deviceLimit: number) {
  if (company.gpswoxUserId) {
    await updateReseller(company.gpswoxUserId, company.email, { devicesLimit: deviceLimit, expiresAt: new Date(Date.now() + RESELLER_OPEN_DAYS * DAY_MS), active: company.status !== "BLOCKED" });
  }
  await prisma.company.update({ where: { id: company.id }, data: { deviceLimit } });
}

export async function createInvoice(company: Company, now = new Date()) {
  const period = closedPeriod(now);
  if (company.createdAt >= period.end) return null;
  if (await prisma.invoice.findUnique({ where: { companyId_periodStart: { companyId: company.id, periodStart: period.start } } })) return null;
  const devices = await prisma.billedDevice.findMany({ where: { companyId: company.id } });
  const found = devicesToBill(devices, period.end);
  const tiers = await prisma.priceTier.findMany();
  const unit = found.items.length ? unitPrice(tiers, devices.filter((d) => !d.removedAt).length) : 0;
  if (found.items.length && unit <= 0) console.warn(`[factura] ${company.id}: no hay precio para este tramo; los equipos no se facturan hasta que se configure.`);
  const items = unit > 0 ? found.items : [];
  const { newDevices, renewals } = unit > 0 ? found : { newDevices: 0, renewals: 0 };
  const setting = company.aiEnabled ? await prisma.aiSetting.findUnique({ where: { id: 1 } }) : null;
  const aiCents = setting && company.trialEndsAt < period.end ? setting.monthlyPriceCents : 0;
  if (!items.length && aiCents <= 0) return null;
  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: { companyId: company.id, periodStart: period.start, periodEnd: period.end, dueAt: period.dueAt, devices: items.length, newDevices, renewals, unitPriceCents: unit, aiCents, amountCents: unit * items.length + aiCents },
    });
    for (const d of items) await tx.billedDevice.update({ where: { id: d.id }, data: { nextBillAt: plusOneYear(d.nextBillAt) } });
    return created;
  });
  await notifyOnce(company, "invoice", `${invoice.id}:invoice`, {
    subject: `Tu factura de GPS Link: ${formatMoney(invoice.amountCents, invoice.currency)}`,
    title: "Tu factura del mes está lista",
    lines: [
      ...(invoice.devices ? [`${invoice.devices} ${invoice.devices === 1 ? "equipo" : "equipos"} (${newDevices} nuevos, ${renewals} renovaciones) a ${formatMoney(unit, invoice.currency)} por año cada uno.`] : []),
      ...(aiCents ? [`Asistente IA del mes: ${formatMoney(aiCents, invoice.currency)}.`] : []),
      `Total: ${formatMoney(invoice.amountCents, invoice.currency)}. Puedes pagar hasta el ${formatDate(new Date(invoice.dueAt.getTime() - DAY_MS))}.`,
    ],
    cta: { label: "Pagar mi factura", url: `${appUrl()}/cuenta` },
  });
  return invoice;
}

export async function markInvoicePaid(invoiceId: string, payment: { method: string; reference?: string; note?: string }, now = new Date()) {
  if (payment.reference && (await prisma.invoice.findUnique({ where: { reference: payment.reference } }))) return null;
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { company: true } });
  if (invoice.status === "PAID") return invoice;
  const paid = await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "PAID", paidAt: now, ...payment } });
  const company = invoice.company;
  if (company.status === "BLOCKED" && !(await prisma.invoice.count({ where: { companyId: company.id, status: "OPEN", dueAt: { lte: now } } }))) {
    if (company.gpswoxUserId) await setResellerActive(company.email, true);
    await prisma.company.update({ where: { id: company.id }, data: { status: "ACTIVE" } });
  }
  await notifyOnce(company, "paid", `${invoiceId}:paid`, {
    subject: "Pago recibido: GPS Link",
    title: "¡Gracias! Recibimos tu pago",
    lines: [`Factura de ${formatMoney(invoice.amountCents, invoice.currency)} pagada.`],
    cta: { label: "Ver mi cuenta", url: `${appUrl()}/cuenta` },
  });
  return paid;
}

export async function blockCompany(company: Company, reason: "unpaid" | "manual") {
  if (company.gpswoxUserId) await setResellerActive(company.email, false);
  await prisma.company.update({ where: { id: company.id }, data: { status: "BLOCKED" } });
  if (reason === "unpaid") {
    await notifyOnce(company, "blocked", `${company.id}:blocked:${new Date().toISOString().slice(0, 10)}`, {
      subject: "Tu plataforma GPS Link fue bloqueada por falta de pago",
      title: "Tu plataforma está bloqueada",
      lines: ["Tu factura venció el día 15 y no recibimos el pago.", "Tus clientes y equipos siguen guardados. Paga tu factura y se reactiva al momento."],
      cta: { label: "Pagar y reactivar", url: `${appUrl()}/cuenta` },
    });
  }
}

export async function unblockCompany(company: Company, now = new Date()): Promise<boolean> {
  if (await prisma.invoice.count({ where: { companyId: company.id, status: "OPEN", dueAt: { lte: now } } })) return false;
  if (company.gpswoxUserId) await setResellerActive(company.email, true);
  await prisma.company.update({ where: { id: company.id }, data: { status: company.trialEndsAt > now ? "TRIAL" : "ACTIVE" } });
  return true;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export async function runDailyLifecycle(now = new Date()) {
  const summary = { reminders: 0, blocked: 0, invoices: 0, clientReminders: 0, clientsBlocked: 0, errors: 0 };
  for (const company of await prisma.company.findMany({ where: { status: { in: ["TRIAL", "ACTIVE", "BLOCKED"] } } })) {
    try {
      await syncDevices(company, now);
      try {
        const clients = await runClientLifecycle(company, now);
        summary.clientReminders += clients.reminders;
        summary.clientsBlocked += clients.blocked;
      } catch (error) {
        summary.errors++;
        console.error(`[clientes] ${company.id}:`, (error as Error).message);
      }
      if (!company.billingEnabled) continue;
      if (company.status === "TRIAL") {
        if (now >= company.trialEndsAt) await prisma.company.update({ where: { id: company.id }, data: { status: "ACTIVE" } });
        const days = reminderDayFor(company.trialEndsAt, now);
        if (days && company.trialEndsAt > now) {
          const sent = await notifyOnce(company, `reminder_${days}`, `${company.id}:${dayKey(company.trialEndsAt)}:reminder_${days}`, {
            subject: `Tu prueba gratis de GPS Link termina en ${days} ${days === 1 ? "día" : "días"}`,
            title: `Te ${days === 1 ? "queda 1 día" : `quedan ${days} días`} de prueba`,
            lines: [`Tu prueba termina el ${formatDate(company.trialEndsAt)}. Desde ahí, a fin de mes te llega la factura de tus equipos y pagas del 1 al 15.`],
            cta: { label: "Ver mi cuenta", url: `${appUrl()}/cuenta` },
          });
          if (sent) summary.reminders++;
        }
      }
      if (await createInvoice(company, now)) summary.invoices++;
      for (const inv of await prisma.invoice.findMany({ where: { companyId: company.id, status: "OPEN" } })) {
        if (inv.dueAt <= now) {
          if (company.status !== "BLOCKED") {
            await blockCompany(company, "unpaid");
            summary.blocked++;
          }
          continue;
        }
        const days = reminderDayFor(inv.dueAt, now);
        if (!days) continue;
        const sent = await notifyOnce(company, `due_${days}`, `${inv.id}:due_${days}`, {
          subject: `Tu factura de GPS Link vence en ${days} ${days === 1 ? "día" : "días"}`,
          title: `Paga tu factura de ${formatMoney(inv.amountCents, inv.currency)}`,
          lines: [`Si no se paga antes del día 16, tu plataforma se bloquea.`],
          cta: { label: "Pagar mi factura", url: `${appUrl()}/cuenta` },
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
