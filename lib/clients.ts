import type { ClientPlan, Company, EndClient } from "@prisma/client";
import { prisma } from "./db";
import { formatDate, formatMoney } from "./format";
import { randomBytes } from "node:crypto";
import { companyPlatformOrigin } from "./brand-web";
import { RESELLER_OPEN_DAYS, DAY_MS } from "./config";
import { clientsUnder, createReseller, setUserActive } from "./gpswox";
import { reminderDayFor } from "./lifecycle";
import { isPermSet, platformPerms } from "./perms";
import { emailHtml, sendEmail } from "./notify";
import { queueWa } from "./wa";

// White labels bill their own clients and dealers: each one has an optional plan and a paid-until date.
// Without a plan a client never expires; when the date passes it is deactivated in GPSWOX until it pays.

export const PERIOD_LABELS: Record<number, string> = { 1: "Mensual", 3: "Trimestral", 6: "Semestral", 12: "Anual" };
export const CURRENCIES = ["usd", "dop"] as const;
const DR_OFFSET_MS = 4 * 60 * 60 * 1000;

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

// "2026-11-05" -> end of that day in Dominican time.
export function endOfDayDR(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T23:59:00-04:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dateInputDR(date: Date): string {
  return new Date(date.getTime() - DR_OFFSET_MS).toISOString().slice(0, 10);
}

export function suggestedAmount(plan: Pick<ClientPlan, "priceCents">, devices: number, periods = 1): number {
  return plan.priceCents * Math.max(devices, 1) * periods;
}

export type ClientState = "gone" | "blocked" | "no_plan" | "due_soon" | "active";

export function clientState(c: Pick<EndClient, "goneAt" | "blockReason" | "planId" | "paidUntil">, now = new Date()): ClientState {
  if (c.goneAt) return "gone";
  if (c.blockReason) return "blocked";
  if (!c.planId || !c.paidUntil) return "no_plan";
  return c.paidUntil.getTime() - now.getTime() <= 7 * 86_400_000 ? "due_soon" : "active";
}

export const STATE_LABELS: Record<ClientState, [string, string]> = {
  gone: ["Eliminado en GPS Link", "CANCELED"],
  blocked: ["Bloqueado", "BLOCKED"],
  no_plan: ["Sin vencimiento", "TRIAL"],
  due_soon: ["Por vencer", "PAST_DUE"],
  active: ["Al día", "ACTIVE"],
};

export async function syncClients(company: Company, now = new Date()): Promise<void> {
  if (!company.gpswoxUserId) return;
  const found = await clientsUnder(company.gpswoxUserId);
  const known = new Set((await prisma.endClient.findMany({ where: { companyId: company.id }, select: { gpswoxUserId: true } })).map((c) => c.gpswoxUserId));
  for (const c of found) {
    if (!known.has(c.id) && c.managerId === company.gpswoxUserId && isPermSet(company.clientPerms)) {
      await platformPerms(company.gpswoxUserId, { kind: "client", id: c.id }, company.clientPerms).catch((e) => console.error("[clientes] permisos:", (e as Error).message));
    }
    const data = { managerId: c.managerId, email: c.email, phone: c.phone, isDealer: c.isDealer, devices: c.devices };
    await prisma.endClient.upsert({
      where: { companyId_gpswoxUserId: { companyId: company.id, gpswoxUserId: c.id } },
      create: { companyId: company.id, gpswoxUserId: c.id, ...data },
      update: { ...data, goneAt: null },
    });
  }
  await prisma.endClient.updateMany({ where: { companyId: company.id, goneAt: null, gpswoxUserId: { notIn: found.map((c) => c.id) } }, data: { goneAt: now } });
}

export class SubDistributorError extends Error {}

// A sub-distributor is a GPS Link reseller under the white label: the white label pays for its devices and bills it with its own plans.
export async function createSubDistributor(company: Company, input: { email: string; phone: string; devicesLimit: number }): Promise<EndClient> {
  if (!company.gpswoxUserId) throw new SubDistributorError("sin-usuario");
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SubDistributorError("correo");
  if (!Number.isInteger(input.devicesLimit) || input.devicesLimit < 1 || input.devicesLimit > company.deviceLimit) throw new SubDistributorError("limite");
  const password = randomBytes(9).toString("base64url");
  let id: number;
  try {
    id = await createReseller({ email, password, devicesLimit: input.devicesLimit, expiresAt: new Date(Date.now() + RESELLER_OPEN_DAYS * DAY_MS), phone: input.phone.trim() || undefined, managerId: company.gpswoxUserId });
  } catch (e) {
    console.error("[subdistribuidor] crear:", (e as Error).message);
    throw new SubDistributorError(/email/i.test((e as Error).message) ? "correo-usado" : "plataforma");
  }
  await syncClients(company);
  const origin = companyPlatformOrigin(company);
  const contact = companyContact(company);
  await sendEmail(email, `${company.name}: tu cuenta de distribuidor`, emailHtml(`Bienvenido a ${company.name}`, [
    `${company.name} te creó una cuenta de distribuidor. Desde ella creas a tus clientes y sus equipos (hasta ${input.devicesLimit}).`,
    `Usuario: ${email}`,
    `Contraseña: ${password}`,
    "Cámbiala cuando entres.",
    `Contacto: ${contact}`,
  ], { label: "Entrar a la plataforma", url: `${origin}/login` }, { name: company.name, contact }), { fromName: company.name, replyTo: company.email });
  const created = await prisma.endClient.findUnique({ where: { companyId_gpswoxUserId: { companyId: company.id, gpswoxUserId: id } } });
  return created ?? prisma.endClient.create({ data: { companyId: company.id, gpswoxUserId: id, email, phone: input.phone.trim() || null, isDealer: true } });
}

const lastSync = new Map<string, number>();

// Syncs at most every 10 minutes per company; returns false if GPS Link could not be read.
export async function syncClientsThrottled(company: Company): Promise<boolean> {
  if (Date.now() - (lastSync.get(company.id) ?? 0) < 10 * 60_000) return true;
  try {
    await syncClients(company);
    lastSync.set(company.id, Date.now());
    return true;
  } catch (e) {
    console.error("[clientes] sync:", (e as Error).message);
    return false;
  }
}

async function descendants(client: EndClient): Promise<EndClient[]> {
  const all = await prisma.endClient.findMany({ where: { companyId: client.companyId, goneAt: null } });
  const out: EndClient[] = [];
  const walk = (managerId: number, depth: number) => {
    if (depth > 10) return;
    for (const c of all.filter((x) => x.managerId === managerId)) {
      out.push(c);
      walk(c.gpswoxUserId, depth + 1);
    }
  };
  walk(client.gpswoxUserId, 0);
  return out;
}

type Message = { subject: string; title: string; lines: string[] };

function companyContact(company: Company): string {
  return [company.phone && `Tel./WhatsApp ${company.phone}`, company.email].filter(Boolean).join(" · ");
}

// Each dedupeKey is sent at most once. Messages go out with the white label's name; replies go to the white label.
async function noticeOnce(company: Company, client: EndClient, kind: string, dedupeKey: string, message: Message): Promise<boolean> {
  try {
    await prisma.clientNotice.create({ data: { endClientId: client.id, kind, dedupeKey, channels: "" } });
  } catch {
    return false;
  }
  const contact = companyContact(company);
  const result = await sendEmail(client.email, message.subject, emailHtml(message.title, [...message.lines, `Contacto: ${contact}`], undefined, { name: company.name, contact }), {
    fromName: company.name,
    replyTo: company.email,
  });
  const wa = await queueWa(company.id, client.phone, [`*${message.title}*`, ...message.lines, `${company.name} · ${contact}`].join("\n")).catch(() => false);
  const channels = [result.ok && "email", wa && "whatsapp"].filter(Boolean).join(",");
  await prisma.clientNotice.update({ where: { dedupeKey }, data: { channels, error: result.ok ? null : `email: ${result.error}` } });
  return true;
}

export async function blockClient(company: Company, client: EndClient, reason: "expired" | "manual"): Promise<void> {
  await setUserActive(client.email, false);
  await prisma.endClient.update({ where: { id: client.id }, data: { blockReason: reason } });
  if (client.isDealer) {
    for (const d of await descendants(client)) {
      if (d.blockReason) continue;
      await setUserActive(d.email, false);
      await prisma.endClient.update({ where: { id: d.id }, data: { blockReason: "dealer" } });
    }
  }
  if (reason === "expired" && client.paidUntil) {
    await noticeOnce(company, client, "blocked", `${client.id}:${client.paidUntil.toISOString()}:blocked`, {
      subject: `Tu servicio de rastreo con ${company.name} fue suspendido`,
      title: "Tu servicio de rastreo está suspendido",
      lines: [`Tu servicio venció el ${formatDate(client.paidUntil)} y no hemos recibido el pago.`, "Tus vehículos y tu historial siguen guardados. Al pagar se reactiva."],
    });
  }
}

// Returns false while the client is past its paid-until date: it must pay (or get a new date) first.
export async function unblockClient(client: EndClient, now = new Date()): Promise<boolean> {
  if (client.planId && client.paidUntil && client.paidUntil <= now) return false;
  await setUserActive(client.email, true);
  await prisma.endClient.update({ where: { id: client.id }, data: { blockReason: null } });
  if (client.isDealer) {
    for (const d of await descendants(client)) {
      if (d.blockReason !== "dealer") continue;
      await setUserActive(d.email, true);
      await prisma.endClient.update({ where: { id: d.id }, data: { blockReason: null } });
    }
  }
  return true;
}

export async function setClientPlan(client: EndClient, planId: string | null, paidUntil: Date | null, now = new Date()): Promise<void> {
  const updated = await prisma.endClient.update({ where: { id: client.id }, data: { planId, paidUntil: planId ? paidUntil : null } });
  if (updated.blockReason === "expired") await unblockClient(updated, now);
}

export async function registerClientPayment(
  company: Company,
  client: EndClient & { plan: ClientPlan | null },
  payment: { periods: number; amountCents: number; method: string; note?: string },
  now = new Date(),
) {
  if (!client.plan) throw new Error("El cliente no tiene plan");
  const base = client.paidUntil && client.paidUntil > now ? client.paidUntil : now;
  const paidUntil = addMonths(base, client.plan.months * payment.periods);
  const created = await prisma.clientPayment.create({
    data: { endClientId: client.id, amountCents: payment.amountCents, currency: client.plan.currency, periods: payment.periods, method: payment.method, note: payment.note, paidUntil },
  });
  const updated = await prisma.endClient.update({ where: { id: client.id }, data: { paidUntil } });
  if (updated.blockReason === "expired") await unblockClient(updated, now);
  await noticeOnce(company, updated, "paid", `${created.id}:paid`, {
    subject: `Pago recibido: ${company.name}`,
    title: "¡Gracias! Recibimos tu pago",
    lines: [`Pago de ${formatMoney(payment.amountCents, client.plan.currency)}.`, `Tu servicio de rastreo queda activo hasta el ${formatDate(paidUntil)}.`],
  });
  return created;
}

export async function runClientLifecycle(company: Company, now = new Date()) {
  const summary = { reminders: 0, blocked: 0 };
  await syncClients(company, now);
  const clients = await prisma.endClient.findMany({ where: { companyId: company.id, goneAt: null, planId: { not: null }, paidUntil: { not: null } } });
  for (const c of clients) {
    const until = c.paidUntil!;
    if (until <= now) {
      if (c.blockReason !== "expired" && c.blockReason !== "manual") {
        await blockClient(company, c, "expired");
        summary.blocked++;
      }
      continue;
    }
    const days = reminderDayFor(until, now);
    if (!days) continue;
    const sent = await noticeOnce(company, c, `due_${days}`, `${c.id}:${until.toISOString()}:due_${days}`, {
      subject: `Tu servicio de rastreo vence en ${days} ${days === 1 ? "día" : "días"}`,
      title: `Tu servicio de rastreo con ${company.name} vence el ${formatDate(until)}`,
      lines: ["Para seguir viendo tus vehículos sin interrupción, realiza tu pago antes de esa fecha."],
    });
    if (sent) summary.reminders++;
  }
  return summary;
}
