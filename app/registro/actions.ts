"use server";

import { localize } from "@/lib/i18n-errors";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { rateLimit } from "@/lib/ai/assistant";
import { BRAND } from "@/lib/config";
import { prisma } from "@/lib/db";
import { RegistrationError, registerCompany } from "@/lib/companies";
import { emailHtml, sendEmail } from "@/lib/notify";
import { setSession } from "@/lib/session";
import { CODE_TTL_MS, MAX_ATTEMPTS, MAX_RESENDS, codeMatches, hashCode, newCode, openPayload, sealPayload } from "@/lib/signup-verify";
import { emailError, normalizeSlug, passwordError, phoneDigits, slugError } from "@/lib/validation";

export type RegisterState = { error?: string; values?: Record<string, string>; step?: "code"; vid?: string; email?: string; info?: string };
type Pending = { name: string; slug: string; contactName: string; email: string; phone: string; planId: string; password: string };

const TOO_MANY = "Demasiados intentos. Espera unos minutos.";

async function clientIp(): Promise<string> {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

async function sendCode(email: string, code: string): Promise<boolean> {
  const html = emailHtml("Tu código de verificación", [
    `Tu código para crear tu cuenta en ${BRAND.name} es: ${code}`,
    "Vence en 15 minutos. Si no fuiste tú, ignora este correo.",
  ]);
  const sent = await sendEmail(email, `${code} es tu código de ${BRAND.name}`, html);
  if (!sent.ok) {
    console.error("[registro] código no enviado", sent.error);
    if (process.env.NODE_ENV !== "production") console.log(`[registro:dev] código para ${email}: ${code}`);
  }
  return sent.ok || process.env.NODE_ENV !== "production";
}

async function registerActionEs(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const values = { name: get("name"), slug: get("slug"), contactName: get("contactName"), email: get("email").toLowerCase(), phone: get("phone"), planId: get("planId") };
  const password = String(formData.get("password") ?? "");
  const slug = normalizeSlug(values.slug || values.name);

  // Hidden field only robots fill in: act as if the code was sent.
  if (get("website")) return { step: "code", vid: "0", email: values.email };

  const error =
    (!values.name && "Escribe el nombre de tu empresa.") ||
    slugError(slug) ||
    (!values.contactName && "Escribe tu nombre.") ||
    emailError(values.email) ||
    (phoneDigits(values.phone).length < 10 && "Escribe tu WhatsApp con código de país (ej. 1 809 555 1234).") ||
    passwordError(password) ||
    (password !== String(formData.get("password2") ?? "") && "Las contraseñas no coinciden.") ||
    (formData.get("terms") !== "on" && "Debes aceptar los términos.") ||
    null;
  if (error) return { error, values };

  const ip = await clientIp();
  if (rateLimit(`registro:${ip}`, 5, 10 * 60_000) > 0 || rateLimit(`registro:${values.email}`, 3, 10 * 60_000) > 0) return { error: TOO_MANY, values };

  if (!(await prisma.plan.findFirst({ where: { id: values.planId, active: true } }))) return { error: "Ese paquete no está disponible.", values };
  if (await prisma.company.findUnique({ where: { email: values.email } })) return { error: "Ya existe una cuenta con ese correo.", values };
  if (await prisma.company.findUnique({ where: { slug } })) return { error: "Ese código de empresa ya está en uso. Elige otro.", values };

  const now = new Date();
  await prisma.signupVerification.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { email: values.email }] } });
  const pending: Pending = { ...values, slug, phone: phoneDigits(values.phone), password };
  const row = await prisma.signupVerification.create({ data: { email: values.email, codeHash: "", payload: sealPayload(pending), expiresAt: new Date(now.getTime() + CODE_TTL_MS) } });
  const code = newCode();
  await prisma.signupVerification.update({ where: { id: row.id }, data: { codeHash: hashCode(row.id, code) } });

  if (!(await sendCode(values.email, code))) {
    await prisma.signupVerification.delete({ where: { id: row.id } });
    return { error: "No pudimos enviar el correo. Revisa que esté bien escrito o inténtalo más tarde.", values };
  }
  return { step: "code", vid: row.id, email: values.email };
}

export async function verifyAction(prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const vid = String(formData.get("vid") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  const back = { step: "code" as const, vid, email: prev.email };
  if (rateLimit(`registro-code:${await clientIp()}`, 20, 10 * 60_000) > 0) return { ...back, error: TOO_MANY };
  if (code.length !== 6) return { ...back, error: "Escribe el código de 6 números que te llegó al correo." };

  const row = vid ? await prisma.signupVerification.findUnique({ where: { id: vid } }) : null;
  if (!row || row.expiresAt < new Date() || row.attempts >= MAX_ATTEMPTS) {
    if (row) await prisma.signupVerification.delete({ where: { id: row.id } });
    return { error: "El código venció o ya no es válido. Vuelve a llenar el formulario." };
  }
  if (!codeMatches(row.id, code, row.codeHash)) {
    const attempts = row.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await prisma.signupVerification.delete({ where: { id: row.id } });
      return { error: "Código incorrecto demasiadas veces. Vuelve a llenar el formulario." };
    }
    await prisma.signupVerification.update({ where: { id: row.id }, data: { attempts } });
    const left = MAX_ATTEMPTS - attempts;
    return { ...back, error: `Código incorrecto. Te ${left === 1 ? "queda 1 intento" : `quedan ${left} intentos`}.` };
  }

  await prisma.signupVerification.delete({ where: { id: row.id } });
  const pending = openPayload<Pending>(row.payload);
  if (!pending) return { error: "Ocurrió un error. Vuelve a llenar el formulario." };
  const { password, ...values } = pending;

  let companyId: string;
  try {
    companyId = (await registerCompany({ ...values, password })).id;
  } catch (e) {
    if (e instanceof RegistrationError) return { error: e.message, values };
    console.error("[registro]", e);
    return { error: "Ocurrió un error. Inténtalo de nuevo.", values };
  }
  await setSession("company", companyId);
  redirect("/cuenta?bienvenido=1");
}

export async function resendAction(prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const vid = String(formData.get("vid") ?? "");
  const back = { step: "code" as const, vid, email: prev.email };
  if (rateLimit(`registro-resend:${await clientIp()}`, 5, 10 * 60_000) > 0) return { ...back, error: TOO_MANY };
  const row = vid ? await prisma.signupVerification.findUnique({ where: { id: vid } }) : null;
  if (!row || row.expiresAt < new Date()) return { error: "El código venció. Vuelve a llenar el formulario." };
  if (row.resends >= MAX_RESENDS) return { ...back, error: "Ya te reenviamos el código varias veces. Revisa tu correo no deseado (spam)." };
  const code = newCode();
  await prisma.signupVerification.update({
    where: { id: row.id },
    data: { codeHash: hashCode(row.id, code), attempts: 0, resends: row.resends + 1, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });
  if (!(await sendCode(row.email, code))) return { ...back, error: "No pudimos enviar el correo. Inténtalo más tarde." };
  return { ...back, info: "Te enviamos un código nuevo." };
}

async function codeActionEs(prev: RegisterState, formData: FormData): Promise<RegisterState> {
  return formData.get("op") === "resend" ? resendAction(prev, formData) : verifyAction(prev, formData);
}

export async function registerAction(prev: RegisterState, formData: FormData): Promise<RegisterState> {
  return localize(await registerActionEs(prev, formData));
}

export async function codeAction(prev: RegisterState, formData: FormData): Promise<RegisterState> {
  return localize(await codeActionEs(prev, formData));
}
