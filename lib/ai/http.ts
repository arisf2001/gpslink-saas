import { createHash } from "node:crypto";
import { prisma } from "../db";
import { getSession } from "../session";
import { assistantConfig, resolveUser, t, type AiUser, type AssistantConfig, type Channel, type Lang } from "./assistant";
import { SessionError } from "./gps";

export function apiError(status: number, error: string, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error, message, ...extra }, { status, headers: extra.retry_after ? { "Retry-After": String(extra.retry_after) } : undefined });
}

export function langOf(value: unknown): Lang {
  return value === "en" ? "en" : "es";
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// Apps authenticate with X-App-Key plus the customer's user_api_hash; the web assistant uses its own httpOnly cookie.
export async function authenticate(req: Request, hashFromRequest: unknown, lang: Lang): Promise<{ user: AiUser; channel: Channel; config: AssistantConfig } | Response> {
  let hash: string | null = null;
  let channel: Channel = "app";
  const appKey = req.headers.get("x-app-key");
  if (appKey) {
    const key = await prisma.aiAppKey.findUnique({ where: { keyHash: hashKey(appKey) } });
    if (!key || key.revokedAt) return apiError(403, "invalid_app_key", t(lang, "Llave de la app no válida.", "Invalid app key."));
    hash = typeof hashFromRequest === "string" && hashFromRequest ? hashFromRequest : null;
  } else {
    hash = await getSession("ia");
    channel = "web";
    if (!hash) return apiError(401, "session_expired", t(lang, "Inicia sesión otra vez.", "Please log in again."));
  }
  if (!hash) return apiError(401, "session_expired", t(lang, "Inicia sesión otra vez.", "Please log in again."));
  try {
    const user = await resolveUser(hash);
    return { user, channel, config: await assistantConfig(user, lang) };
  } catch (e) {
    if (e instanceof SessionError) return apiError(401, "session_expired", t(lang, "Tu sesión de GPS Link venció. Inicia sesión otra vez.", "Your GPS Link session expired. Please log in again."));
    console.error("[ia] auth", e);
    return apiError(502, "upstream_error", t(lang, "No pude conectar con GPS Link. Intenta otra vez.", "I couldn't reach GPS Link. Please try again."));
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
