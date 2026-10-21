import type { CompanyStatus } from "@prisma/client";
import { DAY_MS, REMINDER_DAYS } from "./config";

export type LifecycleCompany = { status: CompanyStatus; trialEndsAt: Date };

export function daysUntil(end: Date, now: Date): number {
  return Math.ceil((end.getTime() - now.getTime()) / DAY_MS);
}

export function reminderDayFor(end: Date, now: Date): number | null {
  const left = daysUntil(end, now);
  return (REMINDER_DAYS as readonly number[]).includes(left) ? left : null;
}

export function trialReminderDue(company: LifecycleCompany, now: Date): number | null {
  return company.status === "TRIAL" ? reminderDayFor(company.trialEndsAt, now) : null;
}

export function shouldBlock(company: LifecycleCompany, now: Date): boolean {
  return company.status === "TRIAL" && now.getTime() >= company.trialEndsAt.getTime();
}

export function plusOneYear(date: Date): Date {
  const end = new Date(date);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  return end;
}

// A renewal continues the device's current year, or starts today if it already expired.
export function renewedEnd(endsAt: Date, now: Date): Date {
  return plusOneYear(endsAt > now ? endsAt : now);
}

export type SlotState = { id: string; deviceId: number | null; startsAt: Date | null; endsAt: Date | null; createdAt: Date };
export type DeviceInfo = { id: number; createdAt: Date };

export function slotIsActive(slot: SlotState, now: Date): boolean {
  return slot.deviceId !== null && !!slot.endsAt && slot.endsAt > now;
}

export function slotIsFree(slot: SlotState, now: Date): boolean {
  return slot.deviceId === null && (!slot.endsAt || slot.endsAt > now);
}

export function usableSlots(slots: SlotState[], now: Date): number {
  return slots.filter((s) => slotIsActive(s, now) || slotIsFree(s, now)).length;
}

// Gives every device that never had a paid year a free paid slot, oldest device first.
// Expired devices keep their slot and wait for a renewal instead of using up a free slot.
// A never-used slot starts on the day the device was added (or the payment day for older devices);
// a slot freed by a deleted device keeps its running year.
export function assignSlots(slots: SlotState[], devices: DeviceInfo[], now: Date): { slots: SlotState[]; changed: SlotState[] } {
  const next = slots.map((s) => ({ ...s }));
  const changed = new Set<SlotState>();
  const present = new Set(devices.map((d) => d.id));
  for (const s of next) {
    if (s.deviceId !== null && !present.has(s.deviceId)) {
      s.deviceId = null;
      changed.add(s);
    }
  }
  const covered = new Set(next.filter((s) => s.deviceId !== null).map((s) => s.deviceId));
  const free = next
    .filter((s) => slotIsFree(s, now))
    .sort((a, b) => {
      if (a.endsAt && b.endsAt) return a.endsAt.getTime() - b.endsAt.getTime();
      if (a.endsAt) return -1;
      if (b.endsAt) return 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  for (const device of [...devices].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (covered.has(device.id)) continue;
    const slot = free.shift();
    if (!slot) break;
    slot.deviceId = device.id;
    if (!slot.endsAt) {
      const start = device.createdAt > slot.createdAt ? device.createdAt : slot.createdAt;
      slot.startsAt = start;
      slot.endsAt = plusOneYear(start);
    }
    changed.add(slot);
  }
  return { slots: next, changed: [...changed] };
}

// Expiration to set on each device: the end of its paid year, or `unpaid` when it has none.
export function deviceExpirations(slots: SlotState[], devices: DeviceInfo[], unpaid: Date): Map<number, Date> {
  const out = new Map<number, Date>();
  for (const d of devices) {
    const ends = slots.filter((s) => s.deviceId === d.id && s.endsAt).map((s) => s.endsAt!.getTime());
    out.set(d.id, ends.length ? new Date(Math.max(...ends)) : unpaid);
  }
  return out;
}
