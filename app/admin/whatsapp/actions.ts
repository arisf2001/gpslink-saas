"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { metaConfig, metaPhoneInfo, metaSend, metaSetting, sealSecret } from "@/lib/meta";
import { getSession } from "@/lib/session";
import { resolveUser } from "@/lib/ai/assistant";
import { login } from "@/lib/ai/gps";
import { sendWhatsApp } from "@/lib/notify";
import { DIRECT_WA, linkPhone, OWNER_WA, queueWa, waNumber } from "@/lib/wa";

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

export async function connectOwnerWaAction() {
  await requireAdmin();
  await prisma.waSession.upsert({ where: { companyId: OWNER_WA }, create: { companyId: OWNER_WA, want: true, status: "CONNECTING" }, update: { want: true, error: null } });
  redirect("/admin/whatsapp");
}

export async function disconnectOwnerWaAction() {
  await requireAdmin();
  await prisma.waSession.updateMany({ where: { companyId: OWNER_WA }, data: { want: false } });
  redirect("/admin/whatsapp");
}

export async function sendOwnerWaAction(formData: FormData) {
  await requireAdmin();
  const text = clean(formData.get("text"), 4000);
  if (!text) back("error", "Escribe el mensaje.");
  const queued = await queueWa(OWNER_WA, clean(formData.get("phone"), 20), text);
  back(queued ? "ok" : "error", queued ? "Mensaje en cola: sale por tu WhatsApp QR en unos segundos." : "Conecta tu WhatsApp por QR y revisa el número (con código de país).");
}

// The owner's (or a direct client's) personal WhatsApp: the assistant sends locations and alerts there through the QR number.
export async function linkPersonalWaAction(formData: FormData) {
  await requireAdmin();
  const phone = waNumber(clean(formData.get("phone"), 20));
  if (!phone) back("error", "Escribe el número con código de país, por ejemplo 18095551234.");
  const email = clean(formData.get("email"), 120).toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) back("error", "Escribe el correo y la contraseña de la plataforma.");
  const hash = await login(email, password).catch(() => null);
  if (!hash) back("error", "Correo o contraseña de la plataforma incorrectos.");
  const user = await resolveUser(hash!).catch(() => null);
  if (!user) back("error", "No pude leer ese usuario de la plataforma.");
  if (user!.company) back("error", `Ese usuario es de la marca ${user!.company.name}: se conecta con el WhatsApp de esa marca.`);
  await linkPhone(DIRECT_WA, phone!, user!);
  const test = await sendWhatsApp(phone!, `Listo, este WhatsApp quedó conectado al usuario ${email} de GPS Link. Aquí te llegarán las ubicaciones que le pidas al asistente o a Alexa, y los avisos de tus vehículos.`);
  back(test.ok ? "ok" : "error", test.ok ? `WhatsApp +${phone} conectado a ${email}. Te mandé un mensaje de prueba.` : `WhatsApp +${phone} conectado a ${email}, pero el mensaje de prueba no salió: conecta el número del negocio por QR arriba.`);
}

export async function unlinkPersonalWaAction(formData: FormData) {
  await requireAdmin();
  await prisma.waLink.deleteMany({ where: { companyId: DIRECT_WA, id: clean(formData.get("id"), 40) } });
  back("ok", "WhatsApp desconectado.");
}
