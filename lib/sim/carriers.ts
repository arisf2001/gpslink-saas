import type { SimCarrier } from "@prisma/client";
import { prisma } from "../db";

export const SIM_STATUS: Record<number, string> = {
  1: "Lista para activar",
  2: "Activa",
  3: "Suspendida",
  4: "En prueba",
  5: "Dada de baja",
  6: "Inventario",
};

export const statusLabel = (s: number) => SIM_STATUS[s] ?? `Estado ${s}`;

const DEFAULTS = [{ code: "telebay", name: "Telebay (Global IoT)", iccidPrefixes: "898522" }];

export async function ensureCarriers(): Promise<SimCarrier[]> {
  for (const c of DEFAULTS) await prisma.simCarrier.upsert({ where: { code: c.code }, create: c, update: {} });
  return prisma.simCarrier.findMany({ orderBy: { name: "asc" } });
}

export function validIccid(value: string): boolean {
  return /^89\d{16,20}$/.test(value);
}

// Longest matching ICCID prefix wins, so a new carrier only needs its prefix and prices.
export function carrierFor(iccid: string, carriers: Pick<SimCarrier, "code" | "iccidPrefixes">[]): string | null {
  let best: { code: string; len: number } | null = null;
  for (const c of carriers) {
    for (const p of c.iccidPrefixes.split(",").map((x) => x.trim()).filter(Boolean)) {
      if (iccid.startsWith(p) && (!best || p.length > best.len)) best = { code: c.code, len: p.length };
    }
  }
  return best?.code ?? null;
}

export const DAY = 86_400_000;

export function daysLeft(expiresAt: Date | null, now = new Date()): number | null {
  return expiresAt ? Math.ceil((expiresAt.getTime() - now.getTime()) / DAY) : null;
}

const COUNTRY_ES: Record<string, string> = {
  多米尼加共和国: "República Dominicana",
  多米尼加: "República Dominicana",
  美国: "Estados Unidos",
  美利坚合众国: "Estados Unidos",
  波多黎各: "Puerto Rico",
  墨西哥: "México",
  加拿大: "Canadá",
  哥伦比亚: "Colombia",
  委内瑞拉: "Venezuela",
  海地: "Haití",
  古巴: "Cuba",
  巴拿马: "Panamá",
  哥斯达黎加: "Costa Rica",
  危地马拉: "Guatemala",
  洪都拉斯: "Honduras",
  萨尔瓦多: "El Salvador",
  尼加拉瓜: "Nicaragua",
  厄瓜多尔: "Ecuador",
  秘鲁: "Perú",
  智利: "Chile",
  阿根廷: "Argentina",
  巴西: "Brasil",
  玻利维亚: "Bolivia",
  巴拉圭: "Paraguay",
  乌拉圭: "Uruguay",
  牙买加: "Jamaica",
  西班牙: "España",
  中国: "China",
  香港: "Hong Kong",
  中国香港: "Hong Kong",
  全球: "Global",
};

export function countryEs(name: string | null | undefined): string {
  if (!name) return "";
  return COUNTRY_ES[name.trim()] ?? name;
}
