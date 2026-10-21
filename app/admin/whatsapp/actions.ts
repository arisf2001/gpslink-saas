"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { metaConfig, metaPhoneInfo, metaSend, metaSetting, sealSecret } from "@/lib/meta";
import { getSession } from "@/lib/session";

async function requireAdmin() {
  if (!(await getSession("admin"))) redirect("/admin");
}

const clean = (v: FormDataEntryValue | null, max = 200) => String(v ?? "").trim().slice(0, max);
const back = (key: "ok" | "error", msg: string): never => redirect(`/admin/whatsapp?${key}=${encodeURIComponent(msg)}`);

export async function saveMetaAction(formData: FormData) {
  await requireAdmin();
  await metaSetting();
  const phoneNumberId = clean(formData.get("phoneNumberId"), 40);
  const version = clean(formData.get("graphVersion"), 10);
  const template = clean(formData.get("template"), 100);
  if (phoneNumberId && !/^\d+$/.test(phoneNumberId)) back("error", "El Phone number ID son solo números.");
  if (template && !/^[a-z0-9_]+$/.test(template)) back("error", "El nombre de la plantilla solo lleva minúsculas, números y _.");
  const token = clean(formData.get("token"), 1000);
  const appSecret = clean(formData.get("appSecret"), 200);
  await prisma.metaSetting.update({
    where: { id: 1 },
    data: {
      enabled: formData.get("enabled") === "on",
      phoneNumberId: phoneNumberId || null,
      wabaId: clean(formData.get("wabaId"), 40) || null,
      template: template || null,
      templateLang: clean(formData.get("templateLang"), 10) || "es",
      graphVersion: /^v\d+\.\d+$/.test(version) ? version : "v23.0",
      ...(token && { tokenSealed: sealSecret(token) }),
      ...(appSecret && { appSecretSealed: sealSecret(appSecret) }),
    },
  });
  back("ok", "Guardado");
}

export async function testMetaAction() {
  await requireAdmin();
  const cfg = await metaConfig();
  if (!cfg) back("error", "Activa la conexión y guarda el Phone number ID y el token primero.");
  const r = await metaPhoneInfo(cfg!);
  back(r.ok ? "ok" : "error", r.ok ? `Conectado: ${r.info}` : r.error!);
}

export async function sendMetaAction(formData: FormData) {
  await requireAdmin();
  const cfg = await metaConfig();
  if (!cfg) back("error", "Activa la conexión primero.");
  const text = clean(formData.get("text"), 4000);
  if (!text) back("error", "Escribe el mensaje.");
  const r = await metaSend(cfg!, clean(formData.get("phone"), 20), text, { template: formData.get("template") === "on" });
  back(r.ok ? "ok" : "error", r.ok ? "Mensaje enviado" : r.error!);
}
