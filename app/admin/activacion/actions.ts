"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseMoneyToCents } from "@/lib/format";
import { getSession } from "@/lib/session";

async function requireAdmin() {
  if (!(await getSession("admin"))) redirect("/admin");
}

export async function saveOfferAction(formData: FormData) {
  await requireAdmin();
  const price = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? 0 : parseMoneyToCents(v);
  };
  const platformCents = price("platform");
  const simCents = price("sim");
  if (platformCents === null || simCents === null) redirect("/admin/activacion?error=precio");
  const chargePlatform = formData.get("chargePlatform") === "on";
  const chargeSim = formData.get("chargeSim") === "on";
  if (!chargePlatform && !chargeSim) redirect("/admin/activacion?error=nada");
  const data = { trackEnabled: formData.get("trackEnabled") === "on", chargePlatform, platformCents, chargeSim, simCents };
  await prisma.activationSetting.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  revalidatePath("/admin/activacion");
  redirect("/admin/activacion?ok=oferta");
}

export async function toggleBrandAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("companyId") ?? "");
  await prisma.company.update({ where: { id }, data: { activationEnabled: formData.get("on") === "1" } });
  revalidatePath("/admin/activacion");
  redirect("/admin/activacion?ok=marca");
}
