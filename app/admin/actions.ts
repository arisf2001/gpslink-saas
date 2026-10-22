"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DAY_MS } from "@/lib/config";
import { blockCompany, markInvoicePaid, runDailyLifecycle, setDeviceLimit, syncDevices, unblockCompany } from "@/lib/companies";
import { parseMoneyToCents } from "@/lib/format";
import { adminCredentialsMatch, clearSession, getSession, setSession } from "@/lib/session";

async function requireAdmin() {
  if (!(await getSession("admin"))) redirect("/admin");
}

export type FormState = { error?: string; ok?: string };

export async function adminLoginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!adminCredentialsMatch(String(formData.get("username") ?? ""), String(formData.get("password") ?? ""))) {
    return { error: "Usuario o contraseña incorrectos." };
  }
  await setSession("admin", "owner");
  redirect("/admin");
}

export async function adminLogoutAction() {
  await clearSession("admin");
  redirect("/admin");
}

export async function savePlanAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const priceCents = parseMoneyToCents(String(formData.get("price") ?? ""));
  if (priceCents === null) redirect("/admin/planes?error=precio");
  await prisma.plan.update({
    where: { id },
    data: {
      name: String(formData.get("name") ?? "").trim() || undefined,
      priceCents,
      features: String(formData.get("features") ?? "").trim(),
      active: formData.get("active") === "on",
      highlighted: formData.get("highlighted") === "on",
    },
  });
  revalidatePath("/");
  redirect(`/admin/planes?ok=${id}`);
}

export async function saveTiersAction(formData: FormData) {
  await requireAdmin();
  for (const tier of await prisma.priceTier.findMany()) {
    const cents = parseMoneyToCents(String(formData.get(`price-${tier.id}`) ?? ""));
    if (cents === null) redirect("/admin/planes?error=precio");
    await prisma.priceTier.update({ where: { id: tier.id }, data: { priceCents: cents } });
  }
  const rate = Number(String(formData.get("dopRate") ?? "").replace(",", "."));
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1000) redirect("/admin/planes?error=tasa");
  await prisma.siteSetting.upsert({ where: { id: 1 }, create: { id: 1, dopRate: rate }, update: { dopRate: rate } });
  revalidatePath("/");
  redirect("/admin/planes?ok=tramos");
}

export async function setLimitAction(formData: FormData) {
  await requireAdmin();
  const company = await prisma.company.findUniqueOrThrow({ where: { id: String(formData.get("companyId")) } });
  const limit = Number(formData.get("limit"));
  if (!Number.isInteger(limit) || limit < 1 || limit > 100000) redirect(`/admin/empresa/${company.id}?error=limite`);
  await setDeviceLimit(company, limit);
  redirect(`/admin/empresa/${company.id}?ok=limite`);
}

export async function markInvoicePaidAction(formData: FormData) {
  await requireAdmin();
  const invoiceId = String(formData.get("invoiceId"));
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  await markInvoicePaid(invoiceId, { method: String(formData.get("method") ?? "manual") || "manual", note: String(formData.get("note") ?? "").trim() || undefined });
  redirect(`/admin/empresa/${invoice.companyId}?ok=pago`);
}

export async function blockAction(formData: FormData) {
  await requireAdmin();
  const company = await prisma.company.findUniqueOrThrow({ where: { id: String(formData.get("companyId")) } });
  await blockCompany(company, "manual");
  redirect(`/admin/empresa/${company.id}?ok=bloqueada`);
}

export async function unblockAction(formData: FormData) {
  await requireAdmin();
  const company = await prisma.company.findUniqueOrThrow({ where: { id: String(formData.get("companyId")) } });
  if (!(await unblockCompany(company))) redirect(`/admin/empresa/${company.id}?error=vencida`);
  redirect(`/admin/empresa/${company.id}?ok=desbloqueada`);
}

export async function setBillingAction(formData: FormData) {
  await requireAdmin();
  const company = await prisma.company.findUniqueOrThrow({ where: { id: String(formData.get("companyId")) } });
  const on = formData.get("on") === "1";
  if (on && !company.billingEnabled) {
    const now = new Date();
    await prisma.billedDevice.updateMany({ where: { companyId: company.id, nextBillAt: { lt: now } }, data: { nextBillAt: now } });
    await prisma.company.update({ where: { id: company.id }, data: { billingEnabled: true, trialEndsAt: now, ...(company.status === "BLOCKED" ? {} : { status: "ACTIVE" }) } });
  } else if (!on) {
    await prisma.company.update({ where: { id: company.id }, data: { billingEnabled: false } });
  }
  redirect(`/admin/empresa/${company.id}?ok=${on ? "cobro-on" : "cobro-off"}`);
}

export async function extendAction(formData: FormData) {
  await requireAdmin();
  const company = await prisma.company.findUniqueOrThrow({ where: { id: String(formData.get("companyId")) } });
  const days = Number(formData.get("days"));
  if (!Number.isInteger(days) || days < 1 || days > 400) redirect(`/admin/empresa/${company.id}?error=dias`);
  const trialEndsAt = new Date(Math.max(company.trialEndsAt.getTime(), Date.now()) + days * DAY_MS);
  await prisma.billedDevice.updateMany({ where: { companyId: company.id, nextBillAt: { lt: trialEndsAt }, addedAt: { lt: trialEndsAt } }, data: { nextBillAt: trialEndsAt } });
  await prisma.company.update({ where: { id: company.id }, data: { trialEndsAt, ...(company.status === "BLOCKED" ? {} : { status: "TRIAL" }) } });
  redirect(`/admin/empresa/${company.id}?ok=extendida`);
}

export async function mockDeviceAction(formData: FormData) {
  await requireAdmin();
  if (process.env.GPSWOX_MODE !== "mock") redirect("/admin");
  const company = await prisma.company.findUniqueOrThrow({ where: { id: String(formData.get("companyId")) } });
  const count = Math.min(Math.max(Number(formData.get("count")) || 1, 1), 200);
  if (company.gpswoxUserId) {
    await prisma.mockDevice.createMany({ data: Array.from({ length: count }, () => ({ gpswoxUserId: company.gpswoxUserId! })) });
    await syncDevices(company);
  }
  redirect(`/admin/empresa/${company.id}?ok=equipo`);
}

export async function runLifecycleAction() {
  await requireAdmin();
  const s = await runDailyLifecycle();
  redirect(`/admin?ok=${encodeURIComponent(`Facturas creadas: ${s.invoices} · Avisos enviados: ${s.reminders} · Bloqueadas: ${s.blocked} · Errores: ${s.errors}`)}`);
}
