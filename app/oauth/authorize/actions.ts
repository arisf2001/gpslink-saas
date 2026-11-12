"use server";

import { redirect } from "next/navigation";
import { rateLimit } from "@/lib/ai/assistant";
import { login } from "@/lib/ai/gps";
import { issueCode } from "@/lib/oauth";
import { parseAuthorize } from "./request";

export type AuthorizeState = { error?: string; email?: string };

export async function authorizeAction(_prev: AuthorizeState, formData: FormData): Promise<AuthorizeState> {
  const get = (k: string) => String(formData.get(k) ?? "") || undefined;
  const parsed = await parseAuthorize({ client_id: get("client_id"), redirect_uri: get("redirect_uri"), state: get("state"), code_challenge: get("code_challenge"), code_challenge_method: get("code_challenge") ? "S256" : undefined, brand: get("brand") });
  if ("error" in parsed) return { error: parsed.error };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Escribe tu correo y contraseña.", email };
  if (rateLimit(`oauth-login:${email}`, 8)) return { error: "Demasiados intentos. Espera un minuto.", email };
  const hash = await login(email, password).catch(() => null);
  if (!hash) return { error: "Correo o contraseña incorrectos.", email };
  const code = await issueCode({ clientId: parsed.clientId, redirectUri: parsed.redirectUri, challenge: parsed.challenge, gpswoxHash: hash, brand: parsed.brand });
  const url = new URL(parsed.redirectUri);
  url.searchParams.set("code", code);
  if (parsed.state) url.searchParams.set("state", parsed.state);
  redirect(url.toString());
}
