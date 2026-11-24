"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashKey } from "@/lib/ai/http";
import { prisma } from "@/lib/db";
import { parseMoneyToCents } from "@/lib/format";
import { getSession } from "@/lib/session";

const AI_FREE_MONTHS = 3;

async function requireAdmin() {
  if (!(await getSession("admin"))) redirect("/admin");
}

export async function saveAiSettingAction(formData: FormData) {
  await requireAdmin();
  const cents = parseMoneyToCents(String(formData.get("price") ?? ""));
  if (cents === null) redirect("/admin/ia?error=precio");
  const model = String(formData.get("model") ?? "gpt-5-mini");
  const data = { enabled: formData.get("enabled") === "on", monthlyPriceCents: cents, model: ["gpt-5-mini", "gpt-5", "gpt-4.1-mini"].includes(model) ? model : "gpt-5-mini" };
  await prisma.aiSetting.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  redirect("/admin/ia?ok=Guardado");
}

export async function setCompanyAiAction(formData: FormData) {
  await requireAdmin();
  const color = String(formData.get("brandColor") ?? "").trim();
  const id = String(formData.get("companyId"));
  const aiEnabled = formData.get("aiEnabled") === "on";
  const current = await prisma.company.findUnique({ where: { id }, select: { aiEnabled: true, aiFreeUntil: true } });
  // The first time the owner turns the AI on, its first 3 months are free (Jan 31 + 3 months = Apr 30).
  const free = new Date();
  const day = free.getDate();
  free.setDate(1);
  free.setMonth(free.getMonth() + AI_FREE_MONTHS);
  free.setDate(Math.min(day, new Date(free.getFullYear(), free.getMonth() + 1, 0).getDate()));
  const firstTime = aiEnabled && current?.aiEnabled === false && !current.aiFreeUntil;
  await prisma.company.update({
    where: { id },
    data: { aiEnabled, ...(firstTime ? { aiFreeUntil: free } : {}), aiName: String(formData.get("aiName") ?? "").trim().slice(0, 60) || null, brandColor: /^#[0-9a-fA-F]{6}$/.test(color) ? color : null },
  });
  redirect("/admin/ia?ok=Empresa actualizada");
}

export type KeyState = { key?: string; error?: string };

export async function createAppKeyAction(_prev: KeyState, formData: FormData): Promise<KeyState> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!name) return { error: "Ponle un nombre a la llave (por ejemplo, App Android)." };
  const key = `glk_${randomBytes(24).toString("base64url")}`;
  await prisma.aiAppKey.create({ data: { name, prefix: key.slice(0, 8), keyHash: hashKey(key) } });
  revalidatePath("/admin/ia");
  return { key };
}

export async function revokeAppKeyAction(formData: FormData) {
  await requireAdmin();
  await prisma.aiAppKey.update({ where: { id: String(formData.get("id")) }, data: { revokedAt: new Date() } });
  redirect("/admin/ia?ok=Llave desactivada");
}
