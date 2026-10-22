import { cookies } from "next/headers";
import { prisma } from "./db";

export type Lang = "es" | "en";

export async function getLang(): Promise<Lang> {
  return (await cookies()).get("lang")?.value === "en" ? "en" : "es";
}

export async function dopRate(): Promise<number> {
  return (await prisma.siteSetting.findUnique({ where: { id: 1 } }))?.dopRate ?? 60;
}

// Spanish shows RD$ (converted at the admin's rate, rounded to whole pesos); English shows US$.
export function publicMoney(usdCents: number, lang: Lang, rate: number): string {
  if (lang === "en") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: usdCents % 100 === 0 ? 0 : 2 }).format(usdCents / 100);
  return new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 }).format(Math.round((usdCents / 100) * rate));
}
