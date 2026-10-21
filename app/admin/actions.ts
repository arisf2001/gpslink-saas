"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import type { PlanCategory } from "@prisma/client";
import { DAY_MS } from "@/lib/config";
import { PurchaseError, blockCompany, recordPurchase, runDailyLifecycle, syncCompany, unblockCompany, type Purchase } from "@/lib/companies";
import { CATEGORY_LABELS, parseMoneyToCents } from "@/lib/format";
import { updateReseller } from "@/lib/gpswox";
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

export async function saveCategoryPriceAction(formData: FormData) {
  await requireAdmin();
  const category = String(formData.get("category")) as PlanCategory;
  if (!(category in CATEGORY_LABELS)) redirect("/admin/planes?error=precio");
  const blockPriceCents = parseMoneyToCents(String(formData.get("blockPrice") ?? ""));
  const renewalPriceCents = parseMoneyToCents(String(formData.get("renewalPrice") ?? ""));
  if (blockPriceCents === null || renewalPriceCents === null) redirect("/admin/planes?error=precio");
  await prisma.categoryPrice.upsert({ where: { category }, update: { blockPriceCents, renewalPriceCents }, create: { category, blockPriceCents, renewalPriceCents } });
  revalidatePath("/");
  redirect(`/admin/planes?ok=precios-${category}`);
}

export async function markPaidAction(formData: FormData) {
  await requireAdmin();
  const companyId = String(formData.get("companyId"));
  const back = `/admin/empresa/${companyId}`;
  const cents = parseMoneyToCents(String(formData.get("amount") ?? ""));
  const kind = String(formData.get("kind")) as Purchase["kind"];
  if (cents === null) redirect(`${back}?error=monto`);
  try {
    await recordPurchase(companyId, {
      kind,
      planId: String(formData.get("planId") ?? "") || undefined,
      blocks: Number(formData.get("blocks") || 0),
      amountCents: cents,
      currency: "usd",
      method: String(formData.get("method") ?? "manual") || "manual",
      note: String(formData.get("note") ?? "").trim() || undefined,
    });
  } catch (error) {
    if (error instanceof PurchaseError) redirect(`${back}?msg=${encodeURIComponent(error.message)}`);
    throw error;
  }
  redirect(`${back}?ok=pago`);
}

export async function blockAction(formData: FormData) {
  await requireAdmin();
  const company = await prisma.company.findUniqueOrThrow({ where: { id: String(formData.get("companyId")) } });
  await blockCompany(company, "manual");
  redirect(`/admin/empresa/${company.id}?ok=bloqueada`);
}

export async function unblockAction(formData: FormData) {
  await requireAdmin();
  const company = await prisma.company.findUniqueOrThrow({ where: { id: String(formData.get("companyId")) }, include: { plan: true } });
  if (!(await unblockCompany(company))) redirect(`/admin/empresa/${company.id}?error=vencida`);
  redirect(`/admin/empresa/${company.id}?ok=desbloqueada`);
}

async function trialCompany(formData: FormData) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: String(formData.get("companyId")) }, include: { plan: true } });
  if (await prisma.slot.count({ where: { companyId: company.id } })) redirect(`/admin/empresa/${company.id}?error=pagada`);
  return company;
}

export async function extendAction(formData: FormData) {
  await requireAdmin();
  const company = await trialCompany(formData);
  const days = Number(formData.get("days"));
  if (!Number.isInteger(days) || days < 1 || days > 400) redirect(`/admin/empresa/${company.id}?error=dias`);
  const trialEndsAt = new Date(Math.max(company.trialEndsAt.getTime(), Date.now()) + days * DAY_MS);
  if (company.gpswoxUserId) await updateReseller(company.gpswoxUserId, company.email, { devicesLimit: company.plan.devices, expiresAt: trialEndsAt, active: true });
  await prisma.company.update({ where: { id: company.id }, data: { trialEndsAt, status: "TRIAL", gpswoxLimit: company.plan.devices } });
  redirect(`/admin/empresa/${company.id}?ok=extendida`);
}

export async function changePlanAction(formData: FormData) {
  await requireAdmin();
  const company = await trialCompany(formData);
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: String(formData.get("planId")) } });
  if (company.gpswoxUserId) {
    await updateReseller(company.gpswoxUserId, company.email, { devicesLimit: plan.devices, expiresAt: company.trialEndsAt, active: company.status === "TRIAL" });
  }
  await prisma.company.update({ where: { id: company.id }, data: { planId: plan.id, gpswoxLimit: plan.devices } });
  redirect(`/admin/empresa/${company.id}?ok=plan`);
}

export async function mockDeviceAction(formData: FormData) {
  await requireAdmin();
  if (process.env.GPSWOX_MODE !== "mock") redirect("/admin");
  const company = await prisma.company.findUniqueOrThrow({ where: { id: String(formData.get("companyId")) } });
  const count = Math.min(Math.max(Number(formData.get("count")) || 1, 1), 200);
  if (company.gpswoxUserId) {
    await prisma.mockDevice.createMany({ data: Array.from({ length: count }, () => ({ gpswoxUserId: company.gpswoxUserId! })) });
    await syncCompany(company.id);
  }
  redirect(`/admin/empresa/${company.id}?ok=equipo`);
}

export async function runLifecycleAction() {
  await requireAdmin();
  const s = await runDailyLifecycle();
  redirect(`/admin?ok=${encodeURIComponent(`Avisos enviados: ${s.reminders} · Bloqueadas: ${s.blocked} · Empresas revisadas: ${s.synced} · Equipos vencidos: ${s.expired} · Errores: ${s.errors}`)}`);
}
