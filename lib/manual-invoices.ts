import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
import { appUrl } from "./config";
import { prisma } from "./db";
import { formatDate, formatMoney } from "./format";
import { ghlConfig, ghlInvoiceStatus, ghlText2Pay } from "./ghl";
import { emailHtml, sendEmail } from "./notify";
import { pushAdmin } from "./push";

export type InvoiceItem = { desc: string; qty: number; unitCents: number };

export function invoiceItems(value: unknown): InvoiceItem[] {
  return Array.isArray(value) ? (value as InvoiceItem[]).filter((i) => i && typeof i.desc === "string") : [];
}

export function invoiceTotal(items: InvoiceItem[]): number {
  return items.reduce((sum, i) => sum + Math.round(i.qty * i.unitCents), 0);
}

export const invoiceUrl = (token: string) => `${appUrl()}/factura/${token}`;
export const invoiceLabel = (number: number) => `Factura #${String(number).padStart(4, "0")}`;

export async function createManualInvoice(data: { companyId: string | null; name: string; email: string; phone: string | null; currency: string; items: InvoiceItem[]; dueAt: Date; note: string | null; provider?: "stripe" | "ghl" }) {
  const last = await prisma.manualInvoice.findFirst({ orderBy: { number: "desc" }, select: { number: true } });
  return prisma.manualInvoice.create({
    data: { ...data, items: data.items, totalCents: invoiceTotal(data.items), number: (last?.number ?? 0) + 1, token: randomBytes(18).toString("base64url") },
  });
}

export async function sendManualInvoice(id: string) {
  const inv = await prisma.manualInvoice.findUnique({ where: { id } });
  if (!inv || inv.status === "VOID") return { ok: false, error: "Factura no encontrada" };
  const items = invoiceItems(inv.items);
  const lines = [
    `Hola ${inv.name}, te enviamos la ${invoiceLabel(inv.number).toLowerCase()} por ${formatMoney(inv.totalCents, inv.currency)}.`,
    ...items.map((i) => `${i.desc} × ${i.qty}: ${formatMoney(Math.round(i.qty * i.unitCents), inv.currency)}`),
    `Vence: ${formatDate(inv.dueAt)}.`,
    ...(inv.note ? [inv.note] : []),
  ];
  const res = await sendEmail(inv.email, `${invoiceLabel(inv.number)} · ${formatMoney(inv.totalCents, inv.currency)}`, emailHtml(invoiceLabel(inv.number), lines, { label: inv.status === "PAID" ? "Ver factura" : "Pagar factura", url: invoiceUrl(inv.token) }));
  if (res.ok) await prisma.manualInvoice.update({ where: { id }, data: { sentAt: new Date() } });
  return res;
}

export async function markManualInvoicePaid(id: string, payment: { method: string; reference?: string | null }) {
  const inv = await prisma.manualInvoice.findUnique({ where: { id } });
  if (!inv || inv.status !== "OPEN") return inv;
  const paid = await prisma.manualInvoice.update({ where: { id }, data: { status: "PAID", paidAt: new Date(), method: payment.method, reference: payment.reference ?? null } });
  await pushAdmin({ title: "Factura pagada", body: `${invoiceLabel(inv.number)} · ${inv.name} · ${formatMoney(inv.totalCents, inv.currency)}`, url: "/admin/facturas" });
  return paid;
}

export async function applyManualInvoiceCheckout(session: Stripe.Checkout.Session) {
  const id = session.metadata?.invoiceId;
  if (!id || session.payment_status !== "paid") return null;
  return markManualInvoicePaid(id, { method: "stripe", reference: typeof session.payment_intent === "string" ? session.payment_intent : session.id });
}

export async function createGhlPayment(id: string) {
  const cfg = ghlConfig();
  const inv = await prisma.manualInvoice.findUnique({ where: { id } });
  if (!cfg || !inv) throw new Error("GHL no está configurado.");
  if (inv.ghlUrl) return inv.ghlUrl;
  const ghl = await ghlText2Pay(cfg, { name: inv.name, email: inv.email, phone: inv.phone, title: `${invoiceLabel(inv.number)} · GPS Link`, items: invoiceItems(inv.items), dueAt: inv.dueAt, note: inv.note });
  await prisma.manualInvoice.update({ where: { id }, data: { ghlInvoiceId: ghl.id, ghlUrl: ghl.url } });
  return ghl.url;
}

export async function checkGhlInvoice(inv: { id: string; status: string; ghlInvoiceId: string | null }) {
  const cfg = ghlConfig();
  if (!cfg || inv.status !== "OPEN" || !inv.ghlInvoiceId) return null;
  if ((await ghlInvoiceStatus(cfg, inv.ghlInvoiceId)) !== "paid") return null;
  return markManualInvoicePaid(inv.id, { method: "ghl", reference: inv.ghlInvoiceId });
}

export async function syncGhlInvoices(): Promise<number> {
  if (!ghlConfig()) return 0;
  const open = await prisma.manualInvoice.findMany({ where: { status: "OPEN", provider: "ghl", ghlInvoiceId: { not: null } }, select: { id: true, status: true, ghlInvoiceId: true } });
  let paid = 0;
  for (const inv of open) if (await checkGhlInvoice(inv).catch(() => null)) paid++;
  return paid;
}
