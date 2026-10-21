import type { CompanyStatus } from "@prisma/client";
import { DAY_MS, REMINDER_DAYS } from "./config";

export type LifecycleCompany = {
  status: CompanyStatus;
  trialEndsAt: Date;
  paidUntil: Date | null;
};

const LIVE_STATUSES: CompanyStatus[] = ["TRIAL", "ACTIVE", "PAST_DUE"];

export function accessEndsAt(company: LifecycleCompany): Date {
  if (company.status === "TRIAL" || !company.paidUntil) return company.trialEndsAt;
  return company.paidUntil;
}

export function daysLeft(company: LifecycleCompany, now: Date): number {
  return Math.ceil((accessEndsAt(company).getTime() - now.getTime()) / DAY_MS);
}

// Returns 3, 2 or 1 when a "you will be blocked in N days" reminder is due, otherwise null.
export function reminderDue(company: LifecycleCompany, now: Date): number | null {
  if (!LIVE_STATUSES.includes(company.status)) return null;
  const left = daysLeft(company, now);
  return (REMINDER_DAYS as readonly number[]).includes(left) ? left : null;
}

export function shouldBlock(company: LifecycleCompany, now: Date): boolean {
  return LIVE_STATUSES.includes(company.status) && now.getTime() >= accessEndsAt(company).getTime();
}

// A paid year starts when the current access ends (so unused trial/paid days are kept), or now if already expired.
export function paidPeriod(company: LifecycleCompany, now: Date): { start: Date; end: Date } {
  const currentEnd = accessEndsAt(company);
  const start = company.status !== "BLOCKED" && company.status !== "CANCELED" && currentEnd > now ? currentEnd : now;
  const end = new Date(start);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  return { start, end };
}
