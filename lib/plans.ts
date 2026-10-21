import type { PlanCategory } from "@prisma/client";
import { prisma } from "./db";
import { CATEGORY_LABELS } from "./format";

export const PACKAGE_SIZES = [50, 100, 300, 400, 500, 1000] as const;

export const DEFAULT_FEATURES = [
  "Plataforma web con tu marca, gratis",
  "App móvil con tu marca, gratis",
  "Crea tus clientes y dealers con su marca",
  "Vende desde 1 equipo con tus precios",
  "Cobra a tus clientes a tu manera",
  "Rastreo en vivo, rutas, alertas y reportes",
  "Apagado de motor a distancia",
].join("\n");

// Prices start at $0 on purpose: the owner sets real prices from /admin before going live.
export async function ensureDefaultPlans() {
  const categories = Object.keys(CATEGORY_LABELS) as PlanCategory[];
  const [plans, prices] = await Promise.all([prisma.plan.count(), prisma.categoryPrice.count()]);
  if (plans >= categories.length * PACKAGE_SIZES.length && prices >= categories.length) return;
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
    await prisma.categoryPrice.upsert({ where: { category }, update: {}, create: { category } });
  }
}

export function featureList(features: string): string[] {
  return features.split("\n").map((f) => f.trim()).filter(Boolean);
}
