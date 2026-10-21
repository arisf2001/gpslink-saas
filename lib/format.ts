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
  FLEET: "Flotas y empresas",
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
  blocked: "Cuenta bloqueada",
  paid: "Pago recibido",
  devices_due_3: "Equipos vencen en 3 días",
  devices_due_2: "Equipos vencen en 2 días",
  devices_due_1: "Equipos vencen en 1 día",
  devices_expired: "Equipos vencidos",
};

export function paymentLabel(p: { kind: string; devices: number }): string {
  if (p.kind === "plan") return `Paquete de ${p.devices} equipos`;
  if (p.kind === "block") return `${p.devices} equipos extra`;
  return `Renovación de ${p.devices} ${p.devices === 1 ? "equipo" : "equipos"}`;
}

export const STATUS_LABELS = {
  TRIAL: "Prueba gratis",
  ACTIVE: "Activa",
  BLOCKED: "Bloqueada",
  CANCELED: "Cancelada",
} as const;
