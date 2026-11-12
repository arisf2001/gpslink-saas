import { DAY_MS } from "./config";

// Billing months follow Dominican Republic time (UTC-4, no daylight saving).
const DR_OFFSET_MS = 4 * 60 * 60 * 1000;

export function monthStart(date: Date): Date {
  const local = new Date(date.getTime() - DR_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + DR_OFFSET_MS);
}

export function addMonths(start: Date, months: number): Date {
  const local = new Date(start.getTime() - DR_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + months, 1) + DR_OFFSET_MS);
}

// The month that just closed: invoices are cut on its last day and due on the 15th of the next month.
export function closedPeriod(now: Date): { start: Date; end: Date; dueAt: Date } {
  const end = monthStart(now);
  return { start: addMonths(end, -1), end, dueAt: new Date(end.getTime() + 15 * DAY_MS) };
}

export type Tier = { minDevices: number; priceCents: number };

export function unitPrice(tiers: Tier[], activeDevices: number): number {
  const sorted = [...tiers].sort((a, b) => b.minDevices - a.minDevices);
  return (sorted.find((t) => activeDevices >= t.minDevices) ?? sorted[sorted.length - 1])?.priceCents ?? 0;
}

export type BillableDevice = { id: string; addedAt: Date; nextBillAt: Date; removedAt: Date | null };

// Devices that must be charged on the invoice of a period ending at `periodEnd`.
export function devicesToBill<T extends BillableDevice>(devices: T[], periodEnd: Date): { items: T[]; newDevices: number; renewals: number } {
  const items = devices.filter((d) => !d.removedAt && d.nextBillAt < periodEnd);
  const newDevices = items.filter((d) => d.nextBillAt.getTime() - d.addedAt.getTime() < 300 * DAY_MS).length;
  return { items, newDevices, renewals: items.length - newDevices };
}
