import { rateLimit } from "@/lib/ai/assistant";
import { registerClient, validRedirect } from "@/lib/oauth";

// RFC 7591 dynamic client registration (used by Gemini when the customer adds the GPS Link custom app).
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (rateLimit(`oauth-register:${ip}`, 10)) return Response.json({ error: "slow_down", error_description: "Too many registrations" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { client_name?: unknown; redirect_uris?: unknown; token_endpoint_auth_method?: unknown };
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (!uris.length || uris.length > 10 || !uris.every(validRedirect)) {
    return Response.json({ error: "invalid_redirect_uri", error_description: "redirect_uris must be 1-10 https URLs" }, { status: 400 });
  }
  const method = body.token_endpoint_auth_method === "none" ? "none" : String(body.token_endpoint_auth_method ?? "client_secret_basic");
  if (!["none", "client_secret_basic", "client_secret_post"].includes(method)) {
    return Response.json({ error: "invalid_client_metadata", error_description: "Unsupported token_endpoint_auth_method" }, { status: 400 });
  }
  const name = String(body.client_name ?? "App").slice(0, 120) || "App";
  const { clientId, secret } = await registerClient({ name, redirectUris: uris, withSecret: method !== "none" });
  return Response.json(
    {
      client_id: clientId,
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: method,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
