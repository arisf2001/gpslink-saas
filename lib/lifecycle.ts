import { DAY_MS, REMINDER_DAYS } from "./config";

export function daysUntil(end: Date, now: Date): number {
  return Math.ceil((end.getTime() - now.getTime()) / DAY_MS);
}

export function reminderDayFor(end: Date, now: Date): number | null {
  const left = daysUntil(end, now);
  return (REMINDER_DAYS as readonly number[]).includes(left) ? left : null;
}

export function plusOneYear(date: Date): Date {
  const end = new Date(date);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  return end;
}

