import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { borderEngineReply } from "./border-zones";
import { redZoneEngineReply } from "./red-zones";
import { aiSetting, confirmCommand, rateLimit, resolveUser, type AiUser } from "./ai/assistant";
import { chat } from "./ai/engine";
import { prisma } from "./db";
import { userApiHash, usersByPhone } from "./gpswox";

const secret = () => {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return value;
};
const baseUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const LINK_MINUTES = 30;
const CONFIRM_MS = 2 * 60_000;
export const DIRECT_WA = "gpslink";
// Owner's own number linked by QR: only sends notices/invoices, never answers.
export const OWNER_WA = "gpslinkowner";

export const internalKey = () => createHmac("sha256", secret()).update("gpslink-wa-internal").digest("hex");

export function checkInternalKey(value: string | null): boolean {
  const a = Buffer.from(value ?? "");
  const b = Buffer.from(internalKey());
  return a.length === b.length && timingSafeEqual(a, b);
}

const aesKey = () => createHash("sha256").update(`${secret()}:wa-seal`).digest();

export function seal(text: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", aesKey(), iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function unseal(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const [iv, tag, enc] = value.split(".").map((s) => Buffer.from(s, "base64url"));
    const d = createDecipheriv("aes-256-gcm", aesKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

const signLink = (payload: string) => createHmac("sha256", secret()).update(`walink:${payload}`).digest("base64url");

export function linkToken(companyId: string, phone: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ c: companyId, p: phone, e: now + LINK_MINUTES * 60_000 })).toString("base64url");
  return `${payload}.${signLink(payload)}`;
}

export function readLinkToken(token: string | undefined, now = Date.now()): { companyId: string; phone: string } | null {
  const [payload, signature] = (token ?? "").split(".");
  if (!payload || !signature) return null;
  const a = Buffer.from(signLink(payload));
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.c !== "string" || typeof data.p !== "string" || data.e < now) return null;
    return { companyId: data.c, phone: data.p };
  } catch {
    return null;
  }
}

export function waNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `1${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export async function queueWa(companyId: string, phone: string | null | undefined, text: string): Promise<boolean> {
  const number = waNumber(phone);
  if (!number) return false;
  const session = await prisma.waSession.findUnique({ where: { companyId } });
  if (session?.status !== "CONNECTED") return false;
  await prisma.waOutbox.create({ data: { companyId, phone: number, text } });
  return true;
}

export async function linkPhone(companyId: string, phone: string, user: AiUser) {
  const data = { gpswoxUserId: user.userId, hashSealed: seal(user.hash), conversationId: null, pendingToken: null, pendingUntil: null };
  await prisma.waLink.upsert({ where: { companyId_phone: { companyId, phone } }, create: { companyId, phone, ...data }, update: data });
}

async function linkFromProfile(phone: string): Promise<boolean> {
  const ids = await usersByPhone(phone).catch((): number[] => []);
  const link = await prisma.waLink.findUnique({ where: { companyId_phone: { companyId: OWNER_WA, phone } } });
  if (!ids.length) {
    if (link) await prisma.waLink.delete({ where: { id: link.id } });
    return false;
  }
  // Several users can share a phone: keep the one already linked, else the first (admins first).
  if (link && ids.includes(link.gpswoxUserId) && unseal(link.hashSealed)) return true;
  const hash = await userApiHash(ids[0]).catch(() => null);
  const user = hash ? await resolveUser(hash).catch(() => null) : null;
  if (!user) return false;
  await linkPhone(OWNER_WA, phone, user);
  return true;
}

export async function handleIncoming(companyId: string, phone: string, text: string): Promise<string | null> {
  const owner = companyId === OWNER_WA;
  const direct = companyId === DIRECT_WA || owner;
  const company = direct ? null : await prisma.company.findUnique({ where: { id: companyId } });
  if (direct ? !(await aiSetting()).enabled : !company || !company.aiEnabled || company.status === "BLOCKED" || company.status === "CANCELED") return null;
  // The owner's business number only answers platform users, matched by the phone in their profile (no linking step).
  if (owner && !(await linkFromProfile(phone))) return null;
  const brand = company?.name ?? "GPS Link";
  const message = text.trim().slice(0, 1000);
  if (!message) return "Por ahora solo entiendo mensajes de texto.";
  if (rateLimit(`wa:${companyId}:${phone}`, 10) > 0) return null;
  const connectMsg = (intro: string) => `${intro}\n${baseUrl()}/wa/vincular?t=${linkToken(companyId, phone)}\n(El enlace vence en ${LINK_MINUTES} minutos.)`;
  const link = await prisma.waLink.findUnique({ where: { companyId_phone: { companyId, phone } } });
  const hash = unseal(link?.hashSealed);
  if (!link || !hash) return connectMsg(`Hola, soy el asistente de ${brand}. Para consultar tus vehículos por aquí, conecta tu cuenta una sola vez en este enlace:`);
  let user: AiUser;
  try {
    user = await resolveUser(hash);
  } catch {
    await prisma.waLink.delete({ where: { id: link.id } });
    return connectMsg("Tu sesión venció. Conecta tu cuenta otra vez aquí:");
  }
  if (owner ? user.company?.aiEnabled === false : (user.company?.id ?? DIRECT_WA) !== companyId) return null;

  const engine = /^(encender|apagar)[.!]*$/i.exec(message);
  if (engine) {
    const reply = (await borderEngineReply(user, engine[1].toLowerCase())) ?? (await redZoneEngineReply(user, engine[1].toLowerCase()));
    if (reply) return reply;
  }

  const pending = link.pendingUntil && link.pendingUntil > new Date() ? unseal(link.pendingToken) : null;
  const clearPending = () => prisma.waLink.update({ where: { id: link.id }, data: { pendingToken: null, pendingUntil: null } });
  if (pending && /^\d{4,6}$/.test(message)) {
    const result = await confirmCommand(user, pending, message, "whatsapp", "es");
    if (result.ok || !/quedan/i.test(result.reply)) await clearPending();
    return result.reply;
  }
  if (pending && /^(cancelar|cancel|no)$/i.test(message)) {
    await clearPending();
    return "Listo, cancelé la orden. No se envió nada al vehículo.";
  }

  const result = await chat({ user, conversationId: link.conversationId, message, lang: "es", deviceId: null, channel: "whatsapp" });
  await prisma.waLink.update({
    where: { id: link.id },
    data: { conversationId: result.conversation_id, pendingToken: result.confirm ? seal(result.confirm.token) : null, pendingUntil: result.confirm ? new Date(Date.now() + CONFIRM_MS) : null },
  });
  let reply = result.reply;
  for (const a of result.actions) if ("url" in a && a.url && !reply.includes(a.url)) reply += `\n${a.label}: ${a.url}`;
  if (result.confirm) reply += "\n\nPara confirmar responde con tu PIN (tienes 2 minutos) o escribe CANCELAR.";
  return reply;
}
