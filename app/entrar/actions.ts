"use server";

import { localize } from "@/lib/i18n-errors";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { rateLimit, resolveUser } from "@/lib/ai/assistant";
import { login } from "@/lib/ai/gps";
import { trackSsoToken } from "@/lib/track-sso";
import { platformOriginFor } from "@/lib/brand-web";

export type TrackLoginState = { error?: string; email?: string };

async function trackLoginActionEs(_prev: TrackLoginState, formData: FormData): Promise<TrackLoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Escribe tu correo y tu contraseña.", email };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimit(`track-login:${ip}`, 10) > 0 || rateLimit(`track-login:${email}`, 5) > 0) return { error: "Demasiados intentos. Espera un minuto.", email };
  const hash = await login(email, password).catch(() => null);
  if (!hash) return { error: "Correo o contraseña incorrectos.", email };
  const user = await resolveUser(hash).catch(() => null);
  if (!user?.userId) return { error: "No pudimos entrar ahora. Inténtalo otra vez.", email };
  redirect(`${await platformOriginFor(user.userId)}/gpslink-sso?t=${encodeURIComponent(trackSsoToken(user.userId))}`);
}

export async function trackLoginAction(prev: TrackLoginState, formData: FormData): Promise<TrackLoginState> {
  return localize(await trackLoginActionEs(prev, formData));
}
