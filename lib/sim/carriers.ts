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
