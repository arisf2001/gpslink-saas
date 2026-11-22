"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { CHANNEL_KEYS, NOTIFICATIONS } from "@/lib/notifications";
import { getSession } from "@/lib/session";

export async function saveNotificationsAction(formData: FormData) {
  if (!(await getSession("admin"))) redirect("/admin");
  const lowBattery = Number(formData.get("lowBattery"));
  const offlineHours = Number(formData.get("offlineHours"));
  if (!Number.isInteger(lowBattery) || lowBattery < 1 || lowBattery > 90 || !Number.isInteger(offlineHours) || offlineHours < 1 || offlineHours > 720) {
    redirect("/admin/equipos?f=notificaciones&error=1");
  }
  const data = { enabled: formData.get("enabled") === "on", zonesEnabled: formData.get("zonesEnabled") === "on", zoneCut: formData.get("zoneCut") === "on", lowBattery, offlineHours };
  await prisma.alertSetting.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  for (const n of NOTIFICATIONS) {
    const rule = Object.fromEntries(CHANNEL_KEYS.map((c) => [c, formData.get(`${n.key}.${c}`) === "on"])) as Record<(typeof CHANNEL_KEYS)[number], boolean>;
    await prisma.notificationRule.upsert({ where: { kind: n.key }, create: { kind: n.key, ...rule }, update: rule });
  }
  redirect("/admin/equipos?f=notificaciones&ok=1");
}
