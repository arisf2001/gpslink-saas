import { assistantConfig, rateLimit, resolveUser } from "@/lib/ai/assistant";
import { setSession } from "@/lib/session";
import { activationAvailable } from "@/lib/activation";

const origins = () => (process.env.IA_WIDGET_ORIGINS ?? "https://track.gpslinkusa.com").split(",").map((o) => o.trim()).filter(Boolean);

function corsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get("origin");
  if (!origin || !origins().includes(origin)) return null;
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" };
}

export async function OPTIONS(req: Request) {
  const headers = corsHeaders(req);
  return new Response(null, { status: headers ? 204 : 403, headers: headers ?? {} });
}

// Lets the tracking platform open the assistant and /activar with the session the customer already has there.
export async function POST(req: Request) {
  const headers = corsHeaders(req);
  if (!headers) return Response.json({ error: "forbidden" }, { status: 403 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimit(`iasso:${ip}`, 60) > 0) return Response.json({ error: "rate_limited" }, { status: 429, headers });
  const body = await req.json().catch(() => ({}));
  const hash = typeof body.user_api_hash === "string" ? body.user_api_hash.slice(0, 300) : "";
  if (!hash) return Response.json({ error: "bad_request" }, { status: 400, headers });
  const user = await resolveUser(hash).catch(() => null);
  if (!user?.userId) return Response.json({ enabled: false }, { status: 401, headers });
  const config = await assistantConfig(user);
  const activation = (await activationAvailable(user.userId).catch(() => ({ ok: false }))).ok;
  if (!config.enabled && !activation) return Response.json({ enabled: false }, { headers });
  await setSession("ia", hash);
  return Response.json({ enabled: config.enabled, activation, name: config.name, color: config.color }, { headers });
}
