import { rateLimit, setPin, t } from "@/lib/ai/assistant";
import { apiError, authenticate, langOf, readJson } from "@/lib/ai/http";

// Creates or changes the customer's PIN; requires their GPS Link password.
export async function POST(req: Request) {
  const body = await readJson(req);
  const lang = langOf(body.lang);
  const auth = await authenticate(req, body.user_api_hash, lang);
  if (auth instanceof Response) return auth;
  const { user } = auth;
  const wait = rateLimit(`pin:${user.userId}:${user.email}`, 5, 10 * 60_000);
  if (wait) return apiError(429, "rate_limited", t(lang, "Espera un momento, por favor.", "Please wait a moment."), { retry_after: wait });
  return Response.json(await setPin(user, String(body.password ?? ""), String(body.pin ?? ""), lang));
}
