"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DAY_MS } from "@/lib/config";
import { blockCompany, recordPayment, runDailyLifecycle, unblockCompany } from "@/lib/companies";
import { parseMoneyToCents } from "@/lib/format";
import { updateReseller } from "@/lib/gpswox";
import { accessEndsAt } from "@/lib/lifecycle";
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

export async function markPaidAction(formData: FormData) {
  await requireAdmin();
  const companyId = String(formData.get("companyId"));
  const cents = parseMoneyToCents(String(formData.get("amount") ?? ""));
  if (cents === null) redirect(`/admin/empresa/${companyId}?error=monto`);
  await recordPayment(companyId, {
    amountCents: cents,
    currency: "usd",
    method: String(formData.get("method") ?? "manual") || "manual",
    note: String(formData.get("note") ?? "").trim() || undefined,
  });
  redirect(`/admin/empresa/${companyId}?ok=pago`);
}

export async function blockAction(formData: FormData) {
  await requireAdmin();
  const company = await prisma.company.findUniqueOrThrow({ where: { id: String(formData.get("companyId")) }, include: { plan: true } });
  await blockCompany(company, "manual");
  redirect(`/admin/empresa/${company.id}?ok=bloqueada`);
}

export async function unblockAction(formData: FormData) {
  await requireAdmin();
  const company = await prisma.company.findUniqueOrThrow({ where: { id: String(formData.get("companyId")) }, include: { plan: true } });
  if (accessEndsAt(company) <= new Date()) redirect(`/admin/empresa/${company.id}?error=vencida`);
  await unblockCompany(company);
  redirect(`/admin/empresa/${company.id}?ok=desbloqueada`);
}

export async function extendAction(formData: FormData) {
  await requireAdmin();
  const days = Number(formData.get("days"));
  const company = await prisma.company.findUniqueOrThrow({ where: { id: String(formData.get("companyId")) }, include: { plan: true } });
  if (!Number.isInteger(days) || days < 1 || days > 400) redirect(`/admin/empresa/${company.id}?error=dias`);
  const base = Math.max(accessEndsAt(company).getTime(), Date.now());
  const end = new Date(base + days * DAY_MS);
  const isTrial = company.status === "TRIAL" || !company.paidUntil;
  if (company.gpswoxUserId) await updateReseller(company.gpswoxUserId, company.email, { devicesLimit: company.plan.devices, expiresAt: end, active: true });
  await prisma.company.update({
    where: { id: company.id },
    data: isTrial ? { trialEndsAt: end, status: "TRIAL" } : { paidUntil: end, status: "ACTIVE" },
  });
  redirect(`/admin/empresa/${company.id}?ok=extendida`);
}

export async function changePlanAction(formData: FormData) {
  await requireAdmin();
  const company = await prisma.company.findUniqueOrThrow({ where: { id: String(formData.get("companyId")) }, include: { plan: true } });
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: String(formData.get("planId")) } });
  if (company.gpswoxUserId) {
    await updateReseller(company.gpswoxUserId, company.email, { devicesLimit: plan.devices, expiresAt: accessEndsAt(company), active: company.status !== "BLOCKED" && company.status !== "CANCELED" });
  }
  await prisma.company.update({ where: { id: company.id }, data: { planId: plan.id } });
  redirect(`/admin/empresa/${company.id}?ok=plan`);
}

export async function runLifecycleAction() {
  await requireAdmin();
  const s = await runDailyLifecycle();
  redirect(`/admin?ok=${encodeURIComponent(`Avisos enviados: ${s.reminders} · Bloqueadas: ${s.blocked} · Errores: ${s.errors}`)}`);
}
