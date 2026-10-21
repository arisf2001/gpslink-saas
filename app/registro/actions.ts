"use server";

import { redirect } from "next/navigation";
import { RegistrationError, registerCompany } from "@/lib/companies";
import { setSession } from "@/lib/session";
import { emailError, normalizeSlug, passwordError, phoneDigits, slugError } from "@/lib/validation";

export type RegisterState = { error?: string; values?: Record<string, string> };

export async function registerAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const values = { name: get("name"), slug: get("slug"), contactName: get("contactName"), email: get("email").toLowerCase(), phone: get("phone"), planId: get("planId") };
  const password = String(formData.get("password") ?? "");
  const slug = normalizeSlug(values.slug || values.name);

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

  let companyId: string;
  try {
    const company = await registerCompany({ ...values, slug, phone: phoneDigits(values.phone), password });
    companyId = company.id;
  } catch (e) {
    if (e instanceof RegistrationError) return { error: e.message, values };
    console.error("[registro]", e);
    return { error: "Ocurrió un error. Inténtalo de nuevo.", values };
  }
  await setSession("company", companyId);
  redirect("/cuenta?bienvenido=1");
}
