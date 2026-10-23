"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeSubdomain, normalizeWebsite, writeBrandMap } from "@/lib/brand-web";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export type WebsiteState = { error?: string; ok?: boolean };

export async function saveWebsiteAction(_prev: WebsiteState, formData: FormData): Promise<WebsiteState> {
  const companyId = await getSession("company");
  if (!companyId) redirect("/cuenta");
  const raw = String(formData.get("websiteUrl") ?? "");
  const websiteUrl = normalizeWebsite(raw);
  if (raw.trim() && !websiteUrl) return { error: "Escribe una dirección válida, por ejemplo https://tumarca.com" };
  await prisma.company.update({ where: { id: companyId }, data: { websiteUrl } });
  revalidatePath("/cuenta/web");
  return { ok: true };
}

export async function saveSubdomainAction(_prev: WebsiteState, formData: FormData): Promise<WebsiteState> {
  const companyId = await getSession("company");
  if (!companyId) redirect("/cuenta");
  const raw = String(formData.get("subdomain") ?? "").trim();
  const subdomain = raw ? normalizeSubdomain(raw) : null;
  if (raw && !subdomain) return { error: "Usa de 3 a 30 letras, números o guiones (sin espacios ni acentos). Algunos nombres están reservados." };
  const taken = subdomain ? await prisma.company.findFirst({ where: { subdomain, NOT: { id: companyId } }, select: { id: true } }) : null;
  if (taken) return { error: "Ese nombre ya lo usa otra empresa. Prueba otro." };
  await prisma.company.update({ where: { id: companyId }, data: { subdomain } });
  await writeBrandMap();
  revalidatePath("/cuenta/web");
  return { ok: true };
}
