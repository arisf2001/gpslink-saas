"use server";

import { redirect } from "next/navigation";
import { activationAvailable, isModel, startActivation } from "@/lib/activation";
import { login, userInfo } from "@/lib/ai/gps";
import { prisma } from "@/lib/db";
import { userIdByEmail } from "@/lib/gpswox";
import { clearSession, getSession, setSession } from "@/lib/session";

export type FormState = { error?: string; values?: { model: string; imei: string; name: string } };

export async function activarLoginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Escribe tu correo y contraseña." };
  const hash = await login(email, password).catch(() => null);
  if (!hash) return { error: "Correo o contraseña de GPS Link incorrectos." };
  await setSession("ia", hash);
  redirect("/activar");
}

export async function activarLogoutAction() {
  await clearSession("ia");
  redirect("/activar");
}

export async function startActivationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const hash = await getSession("ia");
  if (!hash) redirect("/activar");
  const model = String(formData.get("model") ?? "");
  const imei = String(formData.get("imei") ?? "").replace(/\D/g, "");
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
  const fail = (error: string): FormState => ({ error, values: { model, imei, name } });
  if (!isModel(model)) return fail("Escoge el modelo de tu equipo.");
  if (!/^\d{15}$/.test(imei)) return fail("El IMEI debe tener 15 números. Lo encuentras en la etiqueta del equipo.");
  if (!name) return fail("Escribe un nombre para el vehículo.");
  const email = (await userInfo(hash).catch(() => null))?.email;
  const userId = email ? await userIdByEmail(email) : null;
  if (!email || !userId) return fail("No pudimos leer tu cuenta. Sal y vuelve a entrar.");
  const avail = await activationAvailable(userId);
  if (!avail.ok) return fail("La activación en línea no está disponible para tu cuenta. Escríbenos.");
  const busy = await prisma.deviceActivation.findFirst({ where: { imei, status: { in: ["WAITING_SIGNAL", "ACTIVE", "PAST_DUE"] } } });
  if (busy) return fail(busy.gpswoxUserId === userId ? "Ese equipo ya está en proceso de activación o activo." : "Ese IMEI ya está registrado. Escríbenos.");
  let url: string;
  try {
    url = await startActivation({ gpswoxUserId: userId, email, companyId: avail.companyId, model, imei, name });
  } catch {
    return fail("El pago en línea no está disponible ahora. Inténtalo más tarde.");
  }
  redirect(url);
}
