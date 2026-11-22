import { cookies } from "next/headers";
import { prisma } from "./db";
import { formatMoney } from "./format";

export type Lang = "es" | "en";

export async function getLang(): Promise<Lang> {
  return (await cookies()).get("lang")?.value === "en" ? "en" : "es";
}

export async function dopRate(): Promise<number> {
  return (await prisma.siteSetting.findUnique({ where: { id: 1 } }))?.dopRate ?? 60;
}

export async function showPublicPrices(): Promise<boolean> {
  return (await prisma.siteSetting.findUnique({ where: { id: 1 } }))?.showPrices ?? true;
}

// Spanish shows RD$ (converted at the admin's rate, rounded to whole pesos); English shows US$.
export function publicMoney(usdCents: number, lang: Lang, rate: number): string {
  if (lang === "en") return formatMoney(usdCents, "usd", "$");
  return formatMoney(Math.round((usdCents / 100) * rate) * 100, "dop");
}
