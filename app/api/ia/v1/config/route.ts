import { hasPin, t } from "@/lib/ai/assistant";
import { authenticate, langOf } from "@/lib/ai/http";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const lang = langOf(params.get("lang"));
  const auth = await authenticate(req, params.get("user_api_hash"), lang);
  if (auth instanceof Response) return auth;
  const { config, user } = auth;
  const name = user.email.split("@")[0];
  return Response.json({
    enabled: config.enabled,
    assistant_name: config.name,
    brand_color: config.color,
    logo_url: null,
    greeting: t(lang, `Hola ${name}, ¿qué vehículo quieres consultar?`, `Hi ${name}, which vehicle would you like to check?`),
    can_control_engine: true,
    has_pin: await hasPin(user.userId),
    suggestions: lang === "en" ? ["Where is my vehicle?", "Today's route", "Stop engine"] : ["¿Dónde está mi vehículo?", "Recorrido de hoy", "Apagar motor"],
  });
}
