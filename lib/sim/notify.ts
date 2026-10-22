import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
import type { SimCard, SimRenewal } from "@prisma/client";
import { prisma } from "../db";
import { BRAND, appUrl } from "../config";
import { formatDate, formatMoney } from "../format";
import { emailHtml, sendEmail, sendWhatsApp, type ChannelResult } from "../notify";
import { daysLeft, DAY, statusLabel } from "./carriers";
import { syncSims } from "./sync";

export const NOTICE_DAYS = 10;
export const REACTIVATION_NOTE = "Renueve con tiempo: la reactivación puede tardar hasta 5 días laborables.";

const reportTo = () => process.env.SIM_REPORT_EMAIL || BRAND.supportEmail;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
export const payUrl = (r: Pick<SimRenewal, "token">) => `${appUrl()}/sim/pagar/${r.token}`;

// Expired or suspended SIMs also pay the reactivation fee of their carrier.
export async function quote(card: SimCard, now = new Date()) {
  const carrier = await prisma.simCarrier.findUnique({ where: { code: card.carrierCode } });
  if (!carrier || carrier.renewCents <= 0) return null;
  const reactivation = card.status === 3 || (!!card.expiresAt && card.expiresAt <= now);
  return { carrier, reactivation, amountCents: carrier.renewCents + (reactivation ? carrier.reactivateCents : 0), currency: carrier.currency };
}

export async function ensureRenewal(card: SimCard, now = new Date()): Promise<SimRenewal | null> {
  const q = await quote(card, now);
  if (!q) return null;
  const open = await prisma.simRenewal.findFirst({ where: { iccid: card.iccid, status: "PENDING" }, orderBy: { createdAt: "desc" } });
  if (open && open.amountCents === q.amountCents && open.reactivation === q.reactivation && (open.expiresAt?.getTime() ?? 0) === (card.expiresAt?.getTime() ?? 0)) return open;
  if (open) await prisma.simRenewal.update({ where: { id: open.id }, data: { status: "CANCELED" } });
  return prisma.simRenewal.create({
    data: { token: randomBytes(18).toString("base64url"), iccid: card.iccid, expiresAt: card.expiresAt, amountCents: q.amountCents, currency: q.currency, reactivation: q.reactivation },
  });
}

async function noticeOnce(iccid: string, kind: string, dedupeKey: string, send: () => Promise<ChannelResult[]>): Promise<boolean> {
  try {
    await prisma.simNotice.create({ data: { iccid, kind, dedupeKey } });
  } catch {
    return false;
  }
  const results = await send();
  await prisma.simNotice.update({
    where: { dedupeKey },
    data: { channels: results.filter((r) => r.ok).map((r) => r.channel).join(","), error: results.filter((r) => !r.ok).map((r) => `${r.channel}: ${r.error}`).join("; ") || null },
  });
  return true;
}

function toClient(card: SimCard, subject: string, title: string, lines: string[], cta?: { label: string; url: string }): Promise<ChannelResult[]> {
  const text = [`*${title}*`, ...lines, cta?.url ?? ""].filter(Boolean).join("\n");
  return Promise.all([
    card.ownerEmail ? sendEmail(card.ownerEmail, subject, emailHtml(title, lines, cta)) : Promise.resolve<ChannelResult>({ channel: "email", ok: false, error: "sin correo" }),
    card.ownerPhone ? sendWhatsApp(card.ownerPhone, text) : Promise.resolve<ChannelResult>({ channel: "whatsapp", ok: false, error: "sin WhatsApp" }),
  ]);
}

const vehicle = (c: SimCard) => (c.deviceName ? `del vehículo ${c.deviceName}` : `terminada en ${c.iccid.slice(-6)}`);

export async function runSimNotices(now = new Date()) {
  let sent = 0;
  const cards = await prisma.simCard.findMany({
    where: { goneAt: null, deviceId: { not: null }, expiresAt: { not: null, lte: new Date(now.getTime() + NOTICE_DAYS * DAY), gte: new Date(now.getTime() - 30 * DAY) } },
  });
  for (const card of cards) {
    const renewal = await ensureRenewal(card, now);
    if (!renewal) continue;
    const expired = card.expiresAt! <= now;
    const left = daysLeft(card.expiresAt, now) ?? 0;
    const kind = expired ? "expired" : "due10";
    const ok = await noticeOnce(card.iccid, kind, `${card.iccid}:${dayKey(card.expiresAt!)}:${kind}`, () =>
      toClient(
        card,
        expired ? "La SIM de tu GPS venció" : `La SIM de tu GPS vence en ${left} ${left === 1 ? "día" : "días"}`,
        expired ? `La SIM ${vehicle(card)} venció` : `La SIM ${vehicle(card)} vence el ${formatDate(card.expiresAt)}`,
        [
          expired ? "Tu GPS puede dejar de reportar hasta que se renueve el plan de datos." : `Te ${left === 1 ? "queda 1 día" : `quedan ${left} días`}. Renueva el plan de datos por 1 año para que tu GPS no deje de reportar.`,
          `Total: ${formatMoney(renewal.amountCents, renewal.currency)}${renewal.reactivation ? " (incluye la reactivación)" : ""}.`,
          REACTIVATION_NOTE,
        ],
        { label: "Pagar en línea", url: payUrl(renewal) },
      ),
    );
    if (ok) sent++;
  }
  return sent;
}

export async function dailyReportData(now = new Date()) {
  const since = new Date(now.getTime() - DAY);
  const [events, cards, paid] = await Promise.all([
    prisma.simEvent.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" } }),
    prisma.simCard.findMany({ where: { goneAt: null } }),
    prisma.simRenewal.findMany({ where: { status: "PAID" }, orderBy: { paidAt: "asc" } }),
  ]);
  const soon = cards.filter((c) => c.expiresAt && c.expiresAt > now && c.expiresAt.getTime() - now.getTime() <= NOTICE_DAYS * DAY);
  return {
    activations: events.filter((e) => e.kind === "activated"),
    newCards: events.filter((e) => e.kind === "new"),
    changes: events.filter((e) => !["activated", "new"].includes(e.kind)),
    toActivate: cards.filter((c) => c.status === 1),
    paid,
    noDevice: cards.filter((c) => !c.deviceId),
    soon,
    expired: cards.filter((c) => c.expiresAt && c.expiresAt <= now),
  };
}

// Sent once a day after 7:00 a.m. Dominican time.
export async function sendDailyReport(now = new Date()) {
  if ((now.getUTCHours() + 20) % 24 < 7) return false;
  const day = new Date(now.getTime() - 4 * 3600_000).toISOString().slice(0, 10);
  const r = await dailyReportData(now);
  return noticeOnce("report", "report", `report:${day}`, async () => [
    await sendEmail(
      reportTo(),
      `Reporte de SIM ${day}: ${r.activations.length} activaciones, ${r.changes.length} cambios, ${r.paid.length + r.toActivate.length} pendientes`,
      emailHtml(
        `Reporte diario de tarjetas SIM · ${day}`,
        [
          `Activaciones nuevas (24 h): ${r.activations.length}. SIM nuevas en la cuenta: ${r.newCards.length}.`,
          ...r.activations.slice(0, 20).map((e) => `• ${e.iccid}: ${e.detail}`),
          `Cambios (24 h): ${r.changes.length}.`,
          ...r.changes.slice(0, 20).map((e) => `• ${e.iccid}: ${e.detail}`),
          `Pendientes: ${r.paid.length} pagadas por reactivar, ${r.toActivate.length} listas para activar, ${r.noDevice.length} sin equipo asignado.`,
          ...r.paid.map((p) => `• Reactivar ${p.iccid} (pagó el ${formatDate(p.paidAt)}).`),
          `Vencen en ${NOTICE_DAYS} días o menos: ${r.soon.length}. Vencidas: ${r.expired.length}.`,
        ],
        { label: "Abrir Tarjetas SIM", url: `${appUrl()}/admin/sim` },
      ),
    ),
  ]);
}

export async function runSims(now = new Date()) {
  const synced = await syncSims(now);
  const notices = await runSimNotices(now);
  const report = synced ? await sendDailyReport(now) : false;
  return { synced, notices, report };
}

export async function applySimCheckout(session: Stripe.Checkout.Session) {
  const { renewalId } = session.metadata ?? {};
  if (!renewalId || session.payment_status !== "paid" || session.mode !== "payment") return null;
  const renewal = await prisma.simRenewal.findUnique({ where: { id: renewalId } });
  if (!renewal || renewal.status !== "PENDING" || (session.amount_total ?? 0) < renewal.amountCents) return renewal;
  const paid = await prisma.simRenewal.update({ where: { id: renewal.id }, data: { status: "PAID", paidAt: new Date(), stripeSession: session.id } });
  const card = await prisma.simCard.findUnique({ where: { iccid: renewal.iccid } });
  await prisma.simEvent.create({ data: { iccid: renewal.iccid, kind: "paid", detail: `Pagó ${formatMoney(renewal.amountCents, renewal.currency)} por Stripe` } });
  await sendEmail(reportTo(), `SIM pagada: reactivar ${renewal.iccid}`, emailHtml("Una SIM fue pagada", [`ICCID ${renewal.iccid}${card?.deviceName ? ` · ${card.deviceName}` : ""}.`, `Monto: ${formatMoney(renewal.amountCents, renewal.currency)}.`, "Renueva el plan en el panel del proveedor y márcala como reactivada."], { label: "Abrir Tarjetas SIM", url: `${appUrl()}/admin/sim?f=pagadas` }));
  if (card) await noticeOnce(card.iccid, "paid", `${renewal.id}:paid`, () => toClient(card, "Recibimos tu pago de la SIM", "¡Gracias! Recibimos tu pago", [`Pago de ${formatMoney(renewal.amountCents, renewal.currency)} para la SIM ${vehicle(card)}.`, "La reactivación puede tardar hasta 5 días laborables. Te avisamos cuando esté lista."]));
  return paid;
}

export async function markRenewalDone(id: string) {
  const r = await prisma.simRenewal.findUnique({ where: { id } });
  if (!r || r.status !== "PAID") return null;
  const done = await prisma.simRenewal.update({ where: { id }, data: { status: "DONE", doneAt: new Date() } });
  await prisma.simEvent.create({ data: { iccid: r.iccid, kind: "reactivated", detail: "Marcada como reactivada" } });
  const card = await prisma.simCard.findUnique({ where: { iccid: r.iccid } });
  if (card) await noticeOnce(card.iccid, "done", `${r.id}:done`, () => toClient(card, "Tu SIM ya está activa", "Tu SIM ya está activa", [`La SIM ${vehicle(card)} quedó renovada por 1 año (${statusLabel(card.status)}).`]));
  return done;
}
