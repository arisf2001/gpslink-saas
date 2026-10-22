"use server";

import { redirect } from "next/navigation";
import { resolveUser } from "@/lib/ai/assistant";
import { login } from "@/lib/ai/gps";
import { setHomeGroups } from "@/lib/google-home";
import { clearSession, getSession, setSession } from "@/lib/session";

export type IaLoginState = { error?: string };

export async function iaLoginAction(_prev: IaLoginState, formData: FormData): Promise<IaLoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const embed = formData.get("embed") === "1";
  if (!email || !password) return { error: "Escribe tu correo y contraseña." };
  const hash = await login(email, password).catch(() => null);
  if (!hash) return { error: "Correo o contraseña de GPS Link incorrectos." };
  await setSession("ia", hash);
  redirect(embed ? "/asistente?embed=1" : "/asistente");
}

export async function iaLogoutAction(formData: FormData) {
  await clearSession("ia");
  redirect(formData.get("embed") === "1" ? "/asistente?embed=1" : "/asistente");
}

export async function googleHomeGroupsAction(formData: FormData) {
  const hash = await getSession("ia");
  const embed = formData.get("embed") === "1";
  if (hash) {
    const user = await resolveUser(hash);
    await setHomeGroups(user.userId, formData.getAll("group").map(String));
  }
  redirect(`/asistente?${embed ? "embed=1&" : ""}gh=ok#google-home`);
}
