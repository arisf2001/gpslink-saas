"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseMoneyToCents } from "@/lib/format";
import { getSession } from "@/lib/session";
import { validIccid } from "@/lib/sim/carriers";
import { markRenewalDone } from "@/lib/sim/notify";
import { deviceOwner, recordEvent, syncSims } from "@/lib/sim/sync";

async function requireAdmin() {
  if (!(await getSession("admin"))) redirect("/admin");
}

export async function saveCarrierAction(formData: FormData) {
  await requireAdmin();
  const code = String(formData.get("code") ?? "");
  const renew = parseMoneyToCents(String(formData.get("renew") ?? ""));
  const react = parseMoneyToCents(String(formData.get("reactivate") ?? ""));
  const prefixes = String(formData.get("prefixes") ?? "").split(",").map((p) => p.replace(/\D/g, "")).filter(Boolean).join(",");
  if (renew === null || react === null || !prefixes) redirect("/admin/sim?f=precios&error=precio");
  await prisma.simCarrier.update({ where: { code }, data: { renewCents: renew, reactivateCents: react, iccidPrefixes: prefixes } });
  revalidatePath("/admin/sim");
  redirect("/admin/sim?f=precios&ok=precios");
}

export async function syncNowAction() {
  await requireAdmin();
  try {
    await syncSims();
  } catch (e) {
    console.error("[sim] sync:", (e as Error).message);
    redirect("/admin/sim?error=sync");
  }
  revalidatePath("/admin/sim");
  redirect("/admin/sim?ok=sync");
}

export async function linkSimAction(formData: FormData) {
  await requireAdmin();
  const iccid = String(formData.get("iccid") ?? "").trim();
  const deviceId = Number(formData.get("deviceId"));
  const card = validIccid(iccid) ? await prisma.simCard.findUnique({ where: { iccid } }) : null;
  const owner = card && deviceId > 0 ? await deviceOwner(deviceId).catch(() => null) : null;
  if (!card || !owner) redirect(`/admin/sim?f=sin-equipo&error=link`);
  await prisma.simCard.update({
    where: { iccid },
    data: { deviceId: owner.deviceId, deviceName: owner.deviceName, ownerUserId: owner.userId, ownerEmail: owner.email, ownerPhone: owner.phone, linkSource: "manual" },
  });
  await recordEvent(iccid, "device", `Equipo asignado a mano: ${owner.deviceName}`);
  revalidatePath("/admin/sim");
  redirect("/admin/sim?f=sin-equipo&ok=link");
}

export async function markDoneAction(formData: FormData) {
  await requireAdmin();
  await markRenewalDone(String(formData.get("id") ?? ""));
  revalidatePath("/admin/sim");
  redirect("/admin/sim?f=pagadas&ok=done");
}
