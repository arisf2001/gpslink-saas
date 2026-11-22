import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { AiSetting, Company } from "@prisma/client";
import { prisma } from "../db";
import { ancestors, userIdByEmail } from "../gpswox";
import * as gps from "./gps";

export type Lang = "es" | "en";
export type Channel = "app" | "web" | "whatsapp" | "alexa";
// userId 0 = GPS Link's own admin account (not in the client list).
export type AiUser = { hash: string; userId: number; email: string; company: Company | null };

export const t = (lang: Lang, es: string, en: string) => (lang === "en" ? en : es);

const userCache = new Map<string, { at: number; user: AiUser }>();

export async function resolveUser(hash: string): Promise<AiUser> {
  const hit = userCache.get(hash);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.user;
  const info = await gps.userInfo(hash);
  const userId = (await userIdByEmail(info.email)) ?? 0;
  let company: Company | null = null;
  if (userId) {
    const chain = await ancestors(userId);
    const found = await prisma.company.findMany({ where: { gpswoxUserId: { in: chain } } });
    company = found.sort((a, b) => chain.indexOf(a.gpswoxUserId!) - chain.indexOf(b.gpswoxUserId!))[0] ?? null;
  }
  const user = { hash, userId, email: info.email, company };
  userCache.set(hash, { at: Date.now(), user });
  if (userCache.size > 5000) userCache.delete(userCache.keys().next().value!);
  return user;
}

export async function aiSetting(): Promise<AiSetting> {
  return prisma.aiSetting.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}

export type AssistantConfig = { enabled: boolean; name: string; color: string; companyName: string };

export async function assistantConfig(user: AiUser, lang: Lang = "es"): Promise<AssistantConfig> {
  const c = user.company;
  if (c) {
    return { enabled: c.aiEnabled && c.status !== "BLOCKED", name: c.aiName || t(lang, `Asistente ${c.name}`, `${c.name} Assistant`), color: c.brandColor || "#0F4C5C", companyName: c.name };
  }
  const setting = await aiSetting();
  return { enabled: setting.enabled, name: t(lang, "Asistente GPS Link", "GPS Link Assistant"), color: "#0F4C5C", companyName: "GPS Link" };
}

// --- rate limit (per process) ---
const hits = new Map<string, number[]>();
export function rateLimit(key: string, limit: number, windowMs = 60_000): number {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
  if (list.length >= limit) {
    hits.set(key, list);
    return Math.ceil((windowMs - (now - list[0])) / 1000);
  }
  list.push(now);
  hits.set(key, list);
  return 0;
}

// --- PIN and command confirmation ---
const MAX_PIN_ATTEMPTS = 3;
const LOCK_MINUTES = 15;
const CONFIRM_SECONDS = 120;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

export async function hasPin(userId: number): Promise<boolean> {
  return !!(await prisma.aiPin.findUnique({ where: { gpswoxUserId: userId } }));
}

export async function setPin(user: AiUser, password: string, pin: string, lang: Lang): Promise<{ ok: boolean; reply: string }> {
  if (!/^\d{4,6}$/.test(pin)) return { ok: false, reply: t(lang, "El PIN debe tener de 4 a 6 números.", "The PIN must have 4 to 6 digits.") };
  if (!(await gps.login(user.email, password))) return { ok: false, reply: t(lang, "La contraseña de GPS Link no es correcta.", "The GPS Link password is not correct.") };
  const pinHash = await bcrypt.hash(pin, 10);
  await prisma.aiPin.upsert({ where: { gpswoxUserId: user.userId }, create: { gpswoxUserId: user.userId, pinHash }, update: { pinHash, failed: 0, lockedUntil: null } });
  return { ok: true, reply: t(lang, "Listo, tu PIN quedó guardado.", "Done, your PIN was saved.") };
}

export type PendingConfirm = { token: string; command: gps.EngineCommand | "zone_activate"; device_id: number; device_name: string; requires_pin: true };

export async function createConfirm(user: AiUser, deviceId: number, deviceName: string, command: gps.EngineCommand): Promise<PendingConfirm> {
  const token = `cf_${randomBytes(18).toString("base64url")}`;
  await prisma.aiConfirm.create({ data: { id: sha(token), gpswoxUserId: user.userId, deviceId, deviceName, command, expiresAt: new Date(Date.now() + CONFIRM_SECONDS * 1000) } });
  return { token, command, device_id: deviceId, device_name: deviceName, requires_pin: true };
}

export async function createZoneConfirm(user: AiUser, zoneId: string, zoneName: string): Promise<PendingConfirm> {
  const token = `cf_${randomBytes(18).toString("base64url")}`;
  await prisma.aiConfirm.create({ data: { id: sha(token), gpswoxUserId: user.userId, deviceId: 0, deviceName: zoneName.slice(0, 190), command: "zone_activate", zoneId, expiresAt: new Date(Date.now() + CONFIRM_SECONDS * 1000) } });
  return { token, command: "zone_activate", device_id: 0, device_name: zoneName, requires_pin: true };
}

// PIN check with the same lockout as the assistant (used by Google Home's PIN challenge).
export async function verifyPin(userId: number, pin: string): Promise<"ok" | "wrong" | "locked" | "none"> {
  const now = new Date();
  const record = await prisma.aiPin.findUnique({ where: { gpswoxUserId: userId } });
  if (!record) return "none";
  if (record.lockedUntil && record.lockedUntil > now) return "locked";
  if (!(await bcrypt.compare(pin, record.pinHash))) {
    const failed = record.failed + 1;
    const locked = failed >= MAX_PIN_ATTEMPTS;
    await prisma.aiPin.update({ where: { gpswoxUserId: userId }, data: locked ? { failed: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) } : { failed } });
    return locked ? "locked" : "wrong";
  }
  await prisma.aiPin.update({ where: { gpswoxUserId: userId }, data: { failed: 0, lockedUntil: null } });
  return "ok";
}

export async function confirmCommand(user: AiUser, token: string, pin: string, channel: Channel, lang: Lang): Promise<{ ok: boolean; reply: string }> {
  const now = new Date();
  const pending = await prisma.aiConfirm.findUnique({ where: { id: sha(token) } });
  if (!pending || pending.gpswoxUserId !== user.userId || pending.usedAt || pending.expiresAt < now) {
    return { ok: false, reply: t(lang, "Esta confirmación ya no es válida. Pídeme la orden otra vez.", "This confirmation is no longer valid. Please ask me again.") };
  }
  const record = await prisma.aiPin.findUnique({ where: { gpswoxUserId: user.userId } });
  if (!record) return { ok: false, reply: t(lang, "Primero tienes que crear tu PIN.", "You need to create your PIN first.") };
  if (record.lockedUntil && record.lockedUntil > now) {
    return { ok: false, reply: t(lang, `Demasiados intentos. Prueba otra vez en ${LOCK_MINUTES} minutos.`, `Too many attempts. Try again in ${LOCK_MINUTES} minutes.`) };
  }
  if (!(await bcrypt.compare(pin, record.pinHash))) {
    const failed = record.failed + 1;
    const locked = failed >= MAX_PIN_ATTEMPTS;
    await prisma.aiPin.update({ where: { gpswoxUserId: user.userId }, data: locked ? { failed: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) } : { failed } });
    if (locked) {
      await prisma.aiConfirm.update({ where: { id: pending.id }, data: { usedAt: now } });
      return { ok: false, reply: t(lang, `PIN incorrecto. Por seguridad quedó bloqueado ${LOCK_MINUTES} minutos.`, `Wrong PIN. For security it is locked for ${LOCK_MINUTES} minutes.`) };
    }
    const left = MAX_PIN_ATTEMPTS - failed;
    return { ok: false, reply: t(lang, `PIN incorrecto. Te quedan ${left} ${left === 1 ? "intento" : "intentos"}.`, `Wrong PIN. You have ${left} ${left === 1 ? "attempt" : "attempts"} left.`) };
  }
  const claimed = await prisma.aiConfirm.updateMany({ where: { id: pending.id, usedAt: null }, data: { usedAt: now } });
  if (!claimed.count) return { ok: false, reply: t(lang, "Esta confirmación ya se usó.", "This confirmation was already used.") };
  await prisma.aiPin.update({ where: { gpswoxUserId: user.userId }, data: { failed: 0, lockedUntil: null } });
  if (pending.command === "zone_activate") {
    const { activateRedZone } = await import("../red-zones");
    const zone = await activateRedZone(user, pending.zoneId ?? "");
    if (!zone) return { ok: false, reply: t(lang, "Esa zona roja ya no existe.", "That red zone no longer exists.") };
    return {
      ok: true,
      reply: t(lang, `Listo. La zona roja «${zone.name}» quedó activa: te aviso cuando un vehículo entre y apago el motor cuando baje a 20 km/h.`, `Done. The red zone "${zone.name}" is active: I will alert you when a vehicle enters and stop the engine when it slows to 20 km/h.`),
    };
  }
  const command = pending.command as gps.EngineCommand;
  let result: { ok: boolean; error?: string };
  try {
    result = await gps.sendCommand(user.hash, pending.deviceId, command);
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  await prisma.aiCommandLog.create({ data: { gpswoxUserId: user.userId, companyId: user.company?.id ?? null, deviceId: pending.deviceId, deviceName: pending.deviceName, command, channel, ok: result.ok, error: result.error ?? null } });
  if (!result.ok) return { ok: false, reply: t(lang, `GPS Link no pudo enviar la orden: ${result.error}`, `GPS Link could not send the command: ${result.error}`) };
  const what = command === "engine_stop" ? t(lang, "apagar el motor", "stop the engine") : t(lang, "encender el motor", "resume the engine");
  return { ok: true, reply: t(lang, `Listo. Se envió la orden de ${what} a ${pending.deviceName}.`, `Done. The command to ${what} was sent to ${pending.deviceName}.`) };
}
