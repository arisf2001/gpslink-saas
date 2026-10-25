const MONEY_PREFIX: Record<string, string> = { usd: "US$", dop: "RD$" };

// Always x,xxx.xx: RD$33,000.00 / US$2,750.00.
export function formatMoney(cents: number, currency = "usd", prefix?: string): string {
  const cur = currency.toLowerCase();
  const n = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(cents) / 100);
  return `${cents < 0 ? "-" : ""}${prefix ?? MONEY_PREFIX[cur] ?? `${cur.toUpperCase()} `}${n}`;
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
} as const;

export const METHOD_LABELS: Record<string, string> = {
  stripe: "Tarjeta (Stripe)",
  deposito: "Depósito / transferencia",
  azul: "Azul",
  efectivo: "Efectivo",
  manual: "Otro",
};

export const NOTIFICATION_LABELS: Record<string, string> = {
  welcome: "Bienvenida",
  reminder_3: "Prueba: faltan 3 días",
  reminder_2: "Prueba: faltan 2 días",
  reminder_1: "Prueba: falta 1 día",
  invoice: "Factura enviada",
  due_3: "Factura: vence en 3 días",
  due_2: "Factura: vence en 2 días",
  due_1: "Factura: vence en 1 día",
  blocked: "Cuenta bloqueada",
  paid: "Pago recibido",
};

export const STATUS_LABELS = {
  TRIAL: "Prueba gratis",
  ACTIVE: "Activa",
  BLOCKED: "Bloqueada",
  CANCELED: "Cancelada",
} as const;
