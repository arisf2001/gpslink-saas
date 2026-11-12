import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { aiSetting, rateLimit } from "./ai/assistant";
import { appUrl } from "./config";
import { prisma } from "./db";
import { DIRECT_WA, handleIncoming, seal, unseal, waNumber } from "./wa";

export type MetaConfig = { phoneNumberId: string; token: string; appSecret: string | null; template: string | null; templateLang: string; graphVersion: string };

export async function metaSetting() {
  const found = await prisma.metaSetting.findUnique({ where: { id: 1 } });
  return found ?? prisma.metaSetting.create({ data: { id: 1, verifyToken: randomBytes(18).toString("base64url") } });
}

export async function metaConfig(): Promise<MetaConfig | null> {
  const s = await prisma.metaSetting.findUnique({ where: { id: 1 } });
  const token = unseal(s?.tokenSealed);
  if (!s?.enabled || !s.phoneNumberId || !token) return null;
  return { phoneNumberId: s.phoneNumberId, token, appSecret: unseal(s.appSecretSealed), template: s.template, templateLang: s.templateLang, graphVersion: s.graphVersion };
}

export const sealSecret = seal;

async function log(direction: "in" | "out", phone: string, text: string, extra: { wamid?: string; ok?: boolean; error?: string } = {}) {
  await prisma.metaLog.create({ data: { direction, phone, text: text.slice(0, 4000), ...extra } });
}

export async function metaSend(cfg: MetaConfig, phone: string, text: string, opts: { template?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
  const to = waNumber(phone);
  if (!to) return { ok: false, error: "Número inválido" };
  const useTemplate = opts.template && cfg.template;
  const message = useTemplate
    ? { type: "template", template: { name: cfg.template, language: { code: cfg.templateLang }, components: [{ type: "body", parameters: [{ type: "text", text: text.replace(/\s*\n+\s*/g, " · ").slice(0, 1000) }] }] } }
    : { type: "text", text: { body: text.slice(0, 4000), preview_url: false } };
  let result: { ok: boolean; error?: string };
  try {
    const res = await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to, ...message }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({}));
    result = res.ok ? { ok: true } : { ok: false, error: `Meta ${res.status}: ${data?.error?.message ?? "error"}` };
  } catch (error) {
    result = { ok: false, error: (error as Error).message };
  }
  await log("out", to, text, { ok: result.ok, error: result.error }).catch(() => {});
  return result;
}

export async function metaPhoneInfo(cfg: MetaConfig): Promise<{ ok: boolean; info?: string; error?: string }> {
  try {
    const res = await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, { headers: { Authorization: `Bearer ${cfg.token}` }, signal: AbortSignal.timeout(15_000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `Meta ${res.status}: ${data?.error?.message ?? "error"}` };
    return { ok: true, info: `${data.verified_name ?? "?"} · ${data.display_phone_number ?? "?"} · calidad ${data.quality_rating ?? "?"}` };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export function validSignature(appSecret: string, raw: string, header: string | null): boolean {
  const expected = Buffer.from(`sha256=${createHmac("sha256", appSecret).update(raw).digest("hex")}`);
  const got = Buffer.from(header ?? "");
  return expected.length === got.length && timingSafeEqual(expected, got);
}

const menu = () =>
  [
    "Hola, gracias por escribir a GPS Link.",
    "1. Quiero tener mi propia plataforma de rastreo (marca blanca)",
    "2. Ya soy cliente: consultar mis vehículos",
    "3. Hablar con una persona",
    "Responde con el número de la opción.",
  ].join("\n");

export async function handleDirect(phone: string, text: string): Promise<string | null> {
  const message = text.trim();
  if (rateLimit(`meta:${phone}`, 12) > 0) return null;
  const linked = await prisma.waLink.findUnique({ where: { companyId_phone: { companyId: DIRECT_WA, phone } } });
  const aiOn = (await aiSetting()).enabled;
  if (linked && aiOn && !/^(menu|menú|1|3)$/i.test(message)) return handleIncoming(DIRECT_WA, phone, message);
  if (message === "1" || /marca blanca|precio|distribuidor|revend/i.test(message))
    return `Con la marca blanca de GPS Link tienes tu propia plataforma web y app de rastreo con tu marca, gratis, y 3 meses de prueba. Vendes desde 1 equipo con tus precios.\nPrecios y registro: ${appUrl()}/#planes\nPrueba gratis: ${appUrl()}/registro\nSi quieres que te llame un asesor, responde 3.`;
  if (message === "2") return aiOn ? handleIncoming(DIRECT_WA, phone, "hola") : "El asistente para consultar vehículos por WhatsApp estará disponible pronto. Mientras tanto entra a https://track.gpslinkusa.com o responde 3 para hablar con una persona.";
  if (message === "3") return "Listo, un asesor de GPS Link te responderá por aquí lo antes posible.";
  return menu();
}
