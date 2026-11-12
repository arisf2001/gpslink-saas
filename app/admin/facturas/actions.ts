"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseMoneyToCents } from "@/lib/format";
import { createManualInvoice, markManualInvoicePaid, sendManualInvoice, type InvoiceItem } from "@/lib/manual-invoices";
import { getSession } from "@/lib/session";

async function requireAdmin() {
  if (!(await getSession("admin"))) redirect("/admin");
}

const back = (msg: string, key: "ok" | "error" = "ok") => redirect(`/admin/facturas?${key}=${encodeURIComponent(msg)}`);

export async function createInvoiceAction(formData: FormData) {
  await requireAdmin();
  const companyId = String(formData.get("companyId") ?? "") || null;
  const company = companyId ? await prisma.company.findUnique({ where: { id: companyId } }) : null;
  const name = String(formData.get("name") ?? "").trim() || company?.name || "";
  const email = String(formData.get("email") ?? "").trim() || company?.email || "";
  const phone = String(formData.get("phone") ?? "").trim() || company?.phone || null;
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back("Pon el nombre y un correo válido del cliente.", "error");
  const currency = formData.get("currency") === "dop" ? "dop" : "usd";
  const items: InvoiceItem[] = [];
  const descs = formData.getAll("desc"), qtys = formData.getAll("qty"), prices = formData.getAll("price");
  for (let i = 0; i < descs.length; i++) {
    const desc = String(descs[i] ?? "").trim().slice(0, 200);
    const qty = Number(String(qtys[i] ?? "1").replace(",", "."));
    const unitCents = parseMoneyToCents(String(prices[i] ?? ""));
    if (!desc && !String(prices[i] ?? "").trim()) continue;
    if (!desc || !(qty > 0) || unitCents === null) back(`Revisa la línea ${i + 1}: descripción, cantidad y precio.`, "error");
    items.push({ desc, qty, unitCents: unitCents! });
  }
  if (!items.length) back("Agrega al menos una línea.", "error");
  const due = new Date(`${String(formData.get("dueAt") ?? "")}T12:00:00-04:00`);
  const dueAt = isNaN(due.getTime()) ? new Date(Date.now() + 7 * 86400000) : due;
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000) || null;
  const inv = await createManualInvoice({ companyId: company?.id ?? null, name, email, phone, currency, items, dueAt, note });
  revalidatePath("/admin/facturas");
  if (formData.get("send") === "on") {
    const res = await sendManualInvoice(inv.id);
    if (!res.ok) back(`Factura creada, pero no se pudo enviar el correo: ${res.error ?? ""}`, "error");
    back(`Factura #${String(inv.number).padStart(4, "0")} creada y enviada a ${email}.`);
  }
  back(`Factura #${String(inv.number).padStart(4, "0")} creada.`);
}

export async function sendInvoiceAction(formData: FormData) {
  await requireAdmin();
  const res = await sendManualInvoice(String(formData.get("id")));
  revalidatePath("/admin/facturas");
  back(res.ok ? "Correo enviado." : `No se pudo enviar: ${res.error ?? ""}`, res.ok ? "ok" : "error");
}

export async function markPaidAction(formData: FormData) {
  await requireAdmin();
  await markManualInvoicePaid(String(formData.get("id")), { method: String(formData.get("method") || "manual"), reference: String(formData.get("reference") ?? "").trim() || null });
  revalidatePath("/admin/facturas");
  back("Factura marcada como pagada.");
}

export async function voidInvoiceAction(formData: FormData) {
  await requireAdmin();
  await prisma.manualInvoice.updateMany({ where: { id: String(formData.get("id")), status: "OPEN" }, data: { status: "VOID" } });
  revalidatePath("/admin/facturas");
  back("Factura anulada.");
}
