"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeWebsite } from "@/lib/brand-web";
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
