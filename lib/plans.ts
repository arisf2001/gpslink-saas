import type { PlanCategory } from "@prisma/client";
import { prisma } from "./db";
import { CATEGORY_LABELS } from "./format";

export const PACKAGE_SIZES = [50, 100, 300, 400, 500, 1000] as const;

export const DEFAULT_TIERS = [1, 26, 51, 101];

// Device limits offered at signup; if the owner hid all of them, offer all so signup never breaks.
export async function signupPlans() {
  const order = [{ sortOrder: "asc" as const }, { devices: "asc" as const }];
  const visible = await prisma.plan.findMany({ where: { active: true }, orderBy: order });
  return visible.length ? visible : prisma.plan.findMany({ orderBy: order });
}

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
  const [plans, prices] = await Promise.all([prisma.plan.count(), prisma.priceTier.count()]);
  if (plans >= categories.length * PACKAGE_SIZES.length && prices >= DEFAULT_TIERS.length) return;
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
  for (const minDevices of DEFAULT_TIERS) await prisma.priceTier.upsert({ where: { minDevices }, update: {}, create: { minDevices } });
}

export function featureList(features: string): string[] {
  return features.split("\n").map((f) => f.trim()).filter(Boolean);
}
