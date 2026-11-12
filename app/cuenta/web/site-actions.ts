"use server";

import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { IMAGE_KEYS, LIMITS, SECTION_KEYS, SOCIAL_KEYS, TEXT_KEYS, defaultSite, siteFor, type SiteData, type SiteItem } from "@/lib/site";
import { ImageError, saveImage } from "@/lib/site-media";
import { requireTab } from "@/lib/tabs";

async function loadCompany() {
  const companyId = await getSession("company");
  if (!companyId) redirect("/cuenta");
  await requireTab("web");
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) redirect("/cuenta");
  return company;
}

const done = (q: string): never => redirect(`/cuenta/web?${q}#editor`);

export async function saveSiteAction(formData: FormData) {
  const company = await loadCompany();
  const old = siteFor(company);
  const t = (k: string, max = 300) => String(formData.get(k) ?? "").trim().slice(0, max);
  const image = async (prefix: string, current: string): Promise<string> => {
    const file = formData.get(`${prefix}File`);
    if (file instanceof File && file.size > 0) return saveImage(company.id, file);
    if (formData.get(`${prefix}Remove`) === "on") return "";
    return current;
  };
  const site: SiteData = { ...old };
  try {
    for (const k of TEXT_KEYS) site[k] = t(k, k === "heroText" || k === "seoDescription" ? 500 : 160);
    if (!site.name) site.name = company.name;
    site.published = formData.get("published") === "on";
    for (const k of ["primary", "secondary"] as const) {
      const v = t(k, 7);
      site[k] = /^#[0-9a-f]{6}$/i.test(v) ? v : old[k];
    }
    for (const k of IMAGE_KEYS) site[k] = await image(k, old[k]);
    site.sections = Object.fromEntries(SECTION_KEYS.map((k) => [k, formData.get(`sec:${k}`) === "on"])) as SiteData["sections"];
    site.social = Object.fromEntries(SOCIAL_KEYS.map((k) => {
      const v = t(`social:${k}`, 200);
      return [k, /^https?:\/\/\S+$/i.test(v) ? v : ""];
    })) as SiteData["social"];
    const list = async (key: "products" | "features" | "steps"): Promise<SiteItem[]> => {
      const out: SiteItem[] = [];
      for (let i = 0; i < LIMITS[key]; i++) {
        const p = `${key}.${i}.`;
        const title = t(`${p}title`, 100);
        if (!title) continue;
        const img = key === "products" ? await image(`${p}image`, t(`${p}image`, 80)) : "";
        out.push({ title, text: t(`${p}text`, 400), price: key === "products" ? t(`${p}price`, 40) : "", image: img });
      }
      return out;
    };
    site.products = await list("products");
    site.features = await list("features");
    site.steps = await list("steps");
    site.faq = [];
    for (let i = 0; i < LIMITS.faq; i++) {
      const q = t(`faq.${i}.q`, 200);
      if (q) site.faq.push({ q, a: t(`faq.${i}.a`, 800) });
    }
  } catch (e) {
    if (e instanceof ImageError) done(`error=imagen-${e.message}`);
    throw e;
  }
  await prisma.company.update({ where: { id: company.id }, data: { siteData: site as unknown as Prisma.InputJsonValue } });
  done("ok=sitio");
}

export async function resetSiteAction() {
  const company = await loadCompany();
  const old = siteFor(company);
  const fresh = defaultSite(company.name, company.brandColor);
  const site: SiteData = { ...fresh, published: old.published, logo: old.logo, logoDark: old.logoDark, favicon: old.favicon };
  await prisma.company.update({ where: { id: company.id }, data: { siteData: site as unknown as Prisma.InputJsonValue } });
  done("ok=restaurado");
}
