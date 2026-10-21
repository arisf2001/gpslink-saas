"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { waNumber } from "@/lib/wa";

export async function saveAlertSettingAction(formData: FormData) {
  if (!(await getSession("admin"))) redirect("/admin");
  const phoneRaw = String(formData.get("ownerPhone") ?? "").trim();
  const ownerPhone = phoneRaw ? waNumber(phoneRaw) : null;
  const lowBattery = Number(formData.get("lowBattery"));
  const offlineHours = Number(formData.get("offlineHours"));
  if ((phoneRaw && !ownerPhone) || !Number.isInteger(lowBattery) || lowBattery < 1 || lowBattery > 90 || !Number.isInteger(offlineHours) || offlineHours < 1 || offlineHours > 720) {
    redirect("/admin/equipos?error=1");
  }
  const data = { enabled: formData.get("enabled") === "on", ownerPhone, lowBattery, offlineHours };
  await prisma.alertSetting.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  redirect("/admin/equipos?ok=1");
}
