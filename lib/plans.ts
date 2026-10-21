import type { PlanCategory } from "@prisma/client";
import { prisma } from "./db";
import { CATEGORY_LABELS } from "./format";

export const PACKAGE_SIZES = [50, 100, 300, 400, 500, 1000] as const;

export const DEFAULT_FEATURES = [
  "Tu marca: logo, colores y nombre",
  "Panel para administrar tus clientes",
  "Crea tus propios paquetes y precios",
  "Dealers con su propia marca",
  "App móvil con tu marca",
  "Alertas, geocercas, historial y comandos",
].join("\n");

// Prices start at $0 on purpose: the owner sets real prices from /admin before going live.
export async function ensureDefaultPlans() {
  if (await prisma.plan.count()) return;
  const categories = Object.keys(CATEGORY_LABELS) as PlanCategory[];
  for (const [ci, category] of categories.entries()) {
    for (const [si, devices] of PACKAGE_SIZES.entries()) {
      await prisma.plan.upsert({
        where: { category_devices: { category, devices } },
        update: {},
        create: {
          category,
          devices,
          name: `${devices} equipos`,
          priceCents: 0,
          features: DEFAULT_FEATURES,
          highlighted: devices === 300,
          sortOrder: ci * 100 + si,
        },
      });
    }
  }
}

export function featureList(features: string): string[] {
  return features.split("\n").map((f) => f.trim()).filter(Boolean);
}
