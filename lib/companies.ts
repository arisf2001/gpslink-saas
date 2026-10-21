import bcrypt from "bcryptjs";
import type { Company, Plan, Slot } from "@prisma/client";
import { prisma } from "./db";
import { ADDON_DEVICES, DAY_MS, RENEWAL_WINDOW_DAYS, RESELLER_OPEN_DAYS, TRIAL_DAYS, appUrl } from "./config";
import { formatDate, formatMoney } from "./format";
import { createReseller, deviceList, resellerLoginUrl, setDeviceExpiration, setResellerActive, updateReseller } from "./gpswox";
import { assignSlots, deviceExpirations, reminderDayFor, renewedEnd, shouldBlock, trialReminderDue, usableSlots } from "./lifecycle";
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
export class PurchaseError extends Error {}

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
      gpswoxLimit: plan.devices,
    },
    include: { plan: true },
  });

  await notifyOnce(company, "welcome", `${company.id}:welcome`, {
    subject: `Bienvenido a GPS Link: tienes ${TRIAL_DAYS} días gratis`,
    title: `¡Hola ${company.contactName}! Tu plataforma está lista`,
    lines: [
      `Tienes ${TRIAL_DAYS} días gratis, hasta el ${formatDate(trialEndsAt)}, con hasta ${plan.devices} equipos GPS. No te pedimos tarjeta.`,
      "Antes de que termine la prueba eliges y pagas tu paquete. Cada equipo cuenta su año desde el día en que lo agregas.",
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


// Devices whose year ends within the renewal window (or already ended), soonest first.
export function dueSlots(slots: Slot[], now: Date): Slot[] {
  const limit = now.getTime() + RENEWAL_WINDOW_DAYS * DAY_MS;
  return slots
    .filter((s) => s.deviceId !== null && s.endsAt && s.endsAt.getTime() <= limit)
    .sort((a, b) => a.endsAt!.getTime() - b.endsAt!.getTime());
}

export type Purchase = {
  kind: "plan" | "block" | "renewal";
  planId?: string;
  blocks?: number;
  renewCount?: number;
  amountCents: number;
  currency: string;
  method: string;
  reference?: string;
  note?: string;
};

export async function recordPurchase(companyId: string, p: Purchase, now = new Date()): Promise<CompanyWithPlan> {
  if (p.reference && (await prisma.payment.findUnique({ where: { reference: p.reference } }))) {
    return prisma.company.findUniqueOrThrow({ where: { id: companyId }, include: { plan: true } });
  }
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, include: { plan: true, slots: true } });
  let devices = 0;
  let planId: string | null = null;
  let renew: Slot[] = [];
  if (p.kind === "plan") {
    const plan = await prisma.plan.findFirst({ where: { id: p.planId, active: true } });
    if (!plan) throw new PurchaseError("Ese paquete no está disponible.");
    devices = plan.devices;
    planId = plan.id;
  } else if (p.kind === "block") {
    if (!company.slots.length) throw new PurchaseError("Primero hay que comprar un paquete.");
    const blocks = p.blocks ?? 0;
    if (!Number.isInteger(blocks) || blocks < 1 || blocks > 100) throw new PurchaseError("Cantidad de bloques no válida.");
    devices = blocks * ADDON_DEVICES;
  } else {
    const due = dueSlots(company.slots, now);
    renew = due.slice(0, Math.min(p.renewCount || due.length, due.length));
    if (!renew.length) throw new PurchaseError("No hay equipos para renovar.");
    devices = renew.length;
  }

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: { companyId, kind: p.kind, devices, planId, amountCents: p.amountCents, currency: p.currency, method: p.method, reference: p.reference, note: p.note },
    });
    if (p.kind === "renewal") {
      for (const slot of renew) {
        await tx.slot.update({ where: { id: slot.id }, data: { endsAt: renewedEnd(slot.endsAt!, now), expiredNotified: false } });
      }
    } else {
      await tx.slot.createMany({ data: Array.from({ length: devices }, () => ({ companyId, paymentId: created.id })) });
    }
    await tx.company.update({
      where: { id: companyId },
      data: { status: "ACTIVE", ...(planId ? { planId } : {}), ...(company.status !== "ACTIVE" ? { gpswoxLimit: null } : {}) },
    });
    return created;
  });

  await syncCompany(companyId, now);
  const updated = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, include: { plan: true } });
  await notifyOnce(updated, "paid", `${payment.id}:paid`, {
    subject: "Pago recibido: GPS Link",
    title: "¡Gracias! Recibimos tu pago",
    lines: [
      `Monto: ${formatMoney(p.amountCents, p.currency)}.`,
      p.kind === "renewal"
        ? `Renovaste ${devices} ${devices === 1 ? "equipo" : "equipos"} por un año más.`
        : `Tienes ${devices} equipos más. El año de cada uno empieza el día en que lo agregas (los que ya tenías empiezan hoy).`,
    ],
    cta: { label: "Ver mi cuenta", url: `${appUrl()}/cuenta` },
  });
  return updated;
}

// Assigns paid slots to the devices found in GPSWOX and pushes each device's expiration and the reseller's limit.
export async function syncCompany(companyId: string, now = new Date()): Promise<void> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, include: { slots: true } });
  if (company.status !== "ACTIVE" || !company.gpswoxUserId) return;
  const devices = await deviceList(company.gpswoxUserId);
  const { slots, changed } = assignSlots(company.slots, devices, now);
  for (const s of changed) {
    await prisma.slot.update({ where: { id: s.id }, data: { deviceId: s.deviceId, startsAt: s.startsAt, endsAt: s.endsAt } });
  }
  const synced = new Map((await prisma.deviceSync.findMany({ where: { companyId } })).map((d) => [d.deviceId, d.expiresAt.getTime()]));
  for (const [deviceId, expiresAt] of deviceExpirations(slots, devices, company.trialEndsAt)) {
    if (synced.get(deviceId) === expiresAt.getTime()) continue;
    await setDeviceExpiration(deviceId, expiresAt);
    await prisma.deviceSync.upsert({ where: { deviceId }, update: { companyId, expiresAt }, create: { deviceId, companyId, expiresAt } });
  }
  const limit = usableSlots(slots, now);
  if (company.gpswoxLimit !== limit) {
    await updateReseller(company.gpswoxUserId, company.email, { devicesLimit: limit, expiresAt: new Date(now.getTime() + RESELLER_OPEN_DAYS * DAY_MS), active: true });
    await prisma.company.update({ where: { id: companyId }, data: { gpswoxLimit: limit } });
  }
}

export async function blockCompany(company: Company, reason: "expired" | "manual") {
  if (company.gpswoxUserId) await setResellerActive(company.email, false);
  await prisma.company.update({ where: { id: company.id }, data: { status: "BLOCKED" } });
  if (reason === "expired") {
    await notifyOnce(company, "blocked", `${company.id}:blocked:${company.trialEndsAt.toISOString().slice(0, 10)}`, {
      subject: "Tu prueba gratis de GPS Link terminó",
      title: "Tu plataforma está bloqueada",
      lines: [
        "Tu prueba gratis terminó y todavía no elegiste tu paquete.",
        "Tus clientes y equipos siguen guardados. Paga tu paquete y se reactiva al momento.",
      ],
      cta: { label: "Elegir mi paquete", url: `${appUrl()}/cuenta` },
    });
  }
}

export async function unblockCompany(company: CompanyWithPlan, now = new Date()): Promise<boolean> {
  const hasSlots = (await prisma.slot.count({ where: { companyId: company.id } })) > 0;
  if (hasSlots) {
    await prisma.company.update({ where: { id: company.id }, data: { status: "ACTIVE", gpswoxLimit: null } });
    await syncCompany(company.id, now);
    return true;
  }
  if (company.trialEndsAt <= now) return false;
  if (company.gpswoxUserId) await setResellerActive(company.email, true);
  await prisma.company.update({ where: { id: company.id }, data: { status: "TRIAL" } });
  return true;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export async function runDailyLifecycle(now = new Date()) {
  const summary = { reminders: 0, blocked: 0, synced: 0, expired: 0, errors: 0 };

  for (const company of await prisma.company.findMany({ where: { status: "TRIAL" }, include: { plan: true } })) {
    try {
      if (shouldBlock(company, now)) {
        await blockCompany(company, "expired");
        summary.blocked++;
        continue;
      }
      const days = trialReminderDue(company, now);
      if (days) {
        const sent = await notifyOnce(company, `reminder_${days}`, `${company.id}:${dayKey(company.trialEndsAt)}:reminder_${days}`, {
          subject: `Tu prueba gratis de GPS Link termina en ${days} ${days === 1 ? "día" : "días"}`,
          title: `Te ${days === 1 ? "queda 1 día" : `quedan ${days} días`} de prueba`,
          lines: [
            `Tu prueba gratis termina el ${formatDate(company.trialEndsAt)}.`,
            "Elige y paga tu paquete (desde 20 equipos) para que tu plataforma y tus clientes no se bloqueen.",
          ],
          cta: { label: "Elegir mi paquete", url: `${appUrl()}/cuenta` },
        });
        if (sent) summary.reminders++;
      }
    } catch (error) {
      summary.errors++;
      console.error(`[lifecycle] ${company.id}:`, (error as Error).message);
    }
  }

  for (const { id } of await prisma.company.findMany({ where: { status: "ACTIVE" }, select: { id: true } })) {
    try {
      await syncCompany(id, now);
      summary.synced++;
      const company = await prisma.company.findUniqueOrThrow({ where: { id }, include: { slots: { where: { deviceId: { not: null } } } } });
      for (const days of [3, 2, 1]) {
        const count = company.slots.filter((s) => s.endsAt && reminderDayFor(s.endsAt, now) === days).length;
        if (!count) continue;
        const sent = await notifyOnce(company, `devices_due_${days}`, `${id}:devices_due_${days}:${dayKey(now)}`, {
          subject: `${count} ${count === 1 ? "equipo vence" : "equipos vencen"} en ${days} ${days === 1 ? "día" : "días"}`,
          title: `${count} ${count === 1 ? "equipo vence" : "equipos vencen"} en ${days} ${days === 1 ? "día" : "días"}`,
          lines: ["Renuévalos por un año para que no se desactiven."],
          cta: { label: "Renovar equipos", url: `${appUrl()}/cuenta` },
        });
        if (sent) summary.reminders++;
      }
      const expired = company.slots.filter((s) => s.endsAt && s.endsAt <= now && !s.expiredNotified);
      if (expired.length) {
        await notifyOnce(company, "devices_expired", `${id}:devices_expired:${dayKey(now)}`, {
          subject: `${expired.length} ${expired.length === 1 ? "equipo se desactivó" : "equipos se desactivaron"} por vencimiento`,
          title: `${expired.length} ${expired.length === 1 ? "equipo vencido" : "equipos vencidos"}`,
          lines: ["Su año terminó y no se renovaron. Renuévalos y se activan al momento."],
          cta: { label: "Renovar equipos", url: `${appUrl()}/cuenta` },
        });
        await prisma.slot.updateMany({ where: { id: { in: expired.map((s) => s.id) } }, data: { expiredNotified: true } });
        summary.expired += expired.length;
      }
    } catch (error) {
      summary.errors++;
      console.error(`[lifecycle] ${id}:`, (error as Error).message);
    }
  }
  return summary;
}
