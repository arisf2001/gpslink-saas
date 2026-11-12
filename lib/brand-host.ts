import { headers } from "next/headers";
import type { Company } from "@prisma/client";
import { appUrl } from "./config";
import { prisma } from "./db";
import { siteFor, type SiteData } from "./site";

export type HostBrand = { company: Company; site: SiteData; origin: string };

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

// White labels whose public website we serve (built with the editor): their admins sign in at <website>/entrar.
export function brandHasOwnLogin(company: Pick<Company, "websiteUrl" | "name" | "brandColor" | "siteData">): boolean {
  return !!company.websiteUrl && siteFor(company).published;
}

export function accountLoginUrl(company: Pick<Company, "websiteUrl" | "name" | "brandColor" | "siteData">): string {
  return brandHasOwnLogin(company) ? `${company.websiteUrl!.replace(/\/$/, "")}/entrar` : `${appUrl()}/cuenta`;
}

// The white label whose own domain this request came through, or null on gpslinkusa.com.
export async function brandForHost(): Promise<HostBrand | null> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim().split(":")[0].replace(/^www\./, "").toLowerCase();
  if (!host || host === hostOf(appUrl()) || host === "localhost" || host === "127.0.0.1") return null;
  const companies = await prisma.company.findMany({ where: { websiteUrl: { contains: host } } });
  const company = companies.find((c) => hostOf(c.websiteUrl!) === host && brandHasOwnLogin(c));
  return company ? { company, site: siteFor(company), origin: `https://${host}` } : null;
}

export async function requestOrigin(): Promise<string> {
  return (await brandForHost())?.origin ?? appUrl();
}
