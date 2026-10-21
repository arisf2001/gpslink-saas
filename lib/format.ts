export function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("es-DO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Santo_Domingo" }).format(date);
}

export function parseMoneyToCents(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export const CATEGORY_LABELS = {
  WHITE_LABEL: "Marca blanca",
  RENTAL: "Dealers de renta de vehículos",
  FLEET: "Flotas y empresas",
} as const;

export const STATUS_LABELS = {
  TRIAL: "Prueba gratis",
  ACTIVE: "Activa",
  PAST_DUE: "Pago pendiente",
  BLOCKED: "Bloqueada",
  CANCELED: "Cancelada",
} as const;
