import { rateLimit, t } from "@/lib/ai/assistant";
import { chat } from "@/lib/ai/engine";
import { SessionError } from "@/lib/ai/gps";
import { apiError, authenticate, langOf, readJson } from "@/lib/ai/http";

export async function POST(req: Request) {
  const body = await readJson(req);
  const lang = langOf(body.lang);
  const auth = await authenticate(req, body.user_api_hash, lang);
  if (auth instanceof Response) return auth;
  const { user, channel, config } = auth;
  if (!config.enabled) return apiError(403, "assistant_disabled", t(lang, "El asistente no está activo para esta cuenta.", "The assistant is not enabled for this account."));
  const message = String(body.message ?? "").trim().slice(0, 1000);
  if (!message) return apiError(400, "empty_message", t(lang, "Escribe un mensaje.", "Please type a message."));
  const wait = rateLimit(`chat:${user.userId}:${user.email}`, 15);
  if (wait) return apiError(429, "rate_limited", t(lang, "Espera un momento, por favor.", "Please wait a moment."), { retry_after: wait });
  const deviceId = Number(body.device_id) > 0 ? Number(body.device_id) : null;
  try {
    return Response.json(await chat({ user, conversationId: typeof body.conversation_id === "string" ? body.conversation_id : null, message, lang, deviceId, channel }));
  } catch (e) {
    if (e instanceof SessionError) return apiError(401, "session_expired", t(lang, "Tu sesión de GPS Link venció. Inicia sesión otra vez.", "Your GPS Link session expired. Please log in again."));
    console.error("[ia] chat", e);
    return apiError(502, "assistant_error", t(lang, "No pude responder, intenta otra vez.", "I couldn't answer, please try again."));
  }
}
