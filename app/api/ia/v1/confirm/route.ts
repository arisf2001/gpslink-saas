import { confirmCommand, rateLimit, t } from "@/lib/ai/assistant";
import { apiError, authenticate, langOf, readJson } from "@/lib/ai/http";

export async function POST(req: Request) {
  const body = await readJson(req);
  const lang = langOf(body.lang);
  const auth = await authenticate(req, body.user_api_hash, lang);
  if (auth instanceof Response) return auth;
  const { user, channel, config } = auth;
  if (!config.enabled) return apiError(403, "assistant_disabled", t(lang, "El asistente no está activo para esta cuenta.", "The assistant is not enabled for this account."));
  const wait = rateLimit(`confirm:${user.userId}:${user.email}`, 6);
  if (wait) return apiError(429, "rate_limited", t(lang, "Espera un momento, por favor.", "Please wait a moment."), { retry_after: wait });
  return Response.json(await confirmCommand(user, String(body.token ?? ""), String(body.pin ?? ""), channel, lang));
}
