"use server";

import { resolveUser } from "@/lib/ai/assistant";
import { login } from "@/lib/ai/gps";
import { DIRECT_WA, linkPhone, readLinkToken } from "@/lib/wa";

export type LinkState = { ok?: boolean; error?: string };

export async function linkWhatsAppAction(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const target = readLinkToken(String(formData.get("t") ?? ""));
  if (!target) return { error: "Este enlace venció. Escribe otra vez al WhatsApp para recibir uno nuevo." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Escribe tu correo y contraseña." };
  const hash = await login(email, password).catch(() => null);
  if (!hash) return { error: "Correo o contraseña incorrectos." };
  const user = await resolveUser(hash).catch(() => null);
  if (!user || (user.company?.id ?? DIRECT_WA) !== target.companyId) return { error: "Esta cuenta no pertenece a este servicio de rastreo." };
  await linkPhone(target.companyId, target.phone, user);
  return { ok: true };
}
