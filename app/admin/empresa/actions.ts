"use server";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeSubdomain, normalizeWebsite, platformOriginFor, writeBrandMap } from "@/lib/brand-web";
import { updateResellerLogin } from "@/lib/companies";
import { appUrl } from "@/lib/config";
import { prisma } from "@/lib/db";
import { parseMoneyToCents } from "@/lib/format";
import { resellerLoginUrl } from "@/lib/gpswox";
import { emailHtml, sendEmail } from "@/lib/notify";
import { getSession, setSession } from "@/lib/session";
import { trackSsoToken } from "@/lib/track-sso";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN = /^(?=.{4,100}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

async function loadCompany(formData: FormData) {
  if (!(await getSession("admin"))) redirect("/admin");
  return prisma.company.findUniqueOrThrow({ where: { id: String(formData.get("companyId")) } });
}

function back(id: string, query: string): never {
  redirect(`/admin/empresa/${id}?${query}`);
}

export async function saveProfileAction(formData: FormData) {
  const company = await loadCompany(formData);
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const email = text("email").toLowerCase();
  if (!EMAIL.test(email)) back(company.id, "error=correo");
  if (email !== company.email && (await prisma.company.findUnique({ where: { email }, select: { id: true } }))) back(company.id, "error=correo-usado");

  const priceRaw = text("unitPrice");
  const unitPriceCents = priceRaw ? parseMoneyToCents(priceRaw) : null;
  if (priceRaw && unitPriceCents === null) back(company.id, "error=precio");

  const subRaw = text("subdomain").toLowerCase();
  const subdomain = subRaw ? normalizeSubdomain(subRaw) : null;
  if (subRaw && !subdomain) back(company.id, "error=subdominio");
  const domain = text("customDomain").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") || null;
  if (domain && !DOMAIN.test(domain)) back(company.id, "error=dominio");
  for (const [field, value] of [["subdomain", subdomain], ["customDomain", domain]] as const) {
    if (value && (await prisma.company.findFirst({ where: { [field]: value, NOT: { id: company.id } }, select: { id: true } }))) back(company.id, "error=dominio-usado");
  }
  const webRaw = text("websiteUrl");
  const websiteUrl = normalizeWebsite(webRaw);
  if (webRaw && !websiteUrl) back(company.id, "error=web");
  const color = text("brandColor");
  const brandColor = /^#[0-9a-f]{6}$/i.test(color) ? color : company.brandColor;
  const phone = text("phone");

  if (company.gpswoxUserId && (email !== company.email || phone !== company.phone)) {
    try {
      await updateResellerLogin(company, { email, phone });
    } catch (e) {
      back(company.id, `msg=${encodeURIComponent(`GPS Link no aceptó el cambio: ${(e as Error).message}`.slice(0, 300))}`);
    }
  }
  await prisma.company.update({
    where: { id: company.id },
    data: { name: text("name") || company.name, contactName: text("contactName") || company.contactName, phone, email, unitPriceCents, subdomain, customDomain: domain, websiteUrl, brandColor },
  });
  if (subdomain !== company.subdomain || domain !== company.customDomain) await writeBrandMap();
  revalidatePath(`/admin/empresa/${company.id}`);
  back(company.id, "ok=perfil");
}

export async function setPasswordAction(formData: FormData) {
  const company = await loadCompany(formData);
  const typed = String(formData.get("password") ?? "");
  const generated = !typed;
  if (!generated && typed.length < 8) back(company.id, "error=clave");
  const password = generated ? randomBytes(6).toString("base64url") : typed;
  try {
    await updateResellerLogin(company, { password });
  } catch (e) {
    back(company.id, `msg=${encodeURIComponent(`GPS Link no aceptó la contraseña: ${(e as Error).message}`.slice(0, 300))}`);
  }
  await prisma.company.update({ where: { id: company.id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  if (formData.get("send") === "on" || generated) {
    const platform = company.gpswoxUserId ? await platformOriginFor(company.gpswoxUserId) : resellerLoginUrl();
    await sendEmail(company.email, `${company.name}: tu nueva contraseña`, emailHtml(`Tu acceso a ${company.name}`, [
      `Usuario: ${company.email}`,
      `Contraseña: ${password}`,
      `Panel de tu marca (cuenta y facturas): ${appUrl()}/entrar`,
      `Plataforma de rastreo: ${platform.replace(/\/login$/, "")}/login`,
      "Te recomendamos cambiar la contraseña al entrar.",
    ]));
    back(company.id, "ok=clave-enviada");
  }
  back(company.id, "ok=clave");
}

export async function saveNotesAction(formData: FormData) {
  const company = await loadCompany(formData);
  await prisma.company.update({ where: { id: company.id }, data: { adminNotes: String(formData.get("notes") ?? "").slice(0, 20000) || null } });
  back(company.id, "ok=notas");
}

export async function enterAccountAction(formData: FormData) {
  const company = await loadCompany(formData);
  await setSession("company", company.id);
  redirect("/cuenta");
}

export async function enterPlatformAction(formData: FormData) {
  const company = await loadCompany(formData);
  if (!company.gpswoxUserId) back(company.id, "error=sin-usuario");
  redirect(`${await platformOriginFor(company.gpswoxUserId)}/gpslink-sso?t=${encodeURIComponent(trackSsoToken(company.gpswoxUserId))}`);
}
