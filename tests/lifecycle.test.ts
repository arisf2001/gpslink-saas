import { test } from "node:test";
import assert from "node:assert/strict";
import { daysLeft, paidPeriod, reminderDue, shouldBlock } from "../lib/lifecycle";

const DAY = 86_400_000;
const now = new Date("2026-10-12T15:00:00Z");
const trial = (msLeft: number) => ({ status: "TRIAL" as const, trialEndsAt: new Date(now.getTime() + msLeft), paidUntil: null });

test("reminders fire at 3, 2 and 1 days before the trial ends", () => {
  assert.equal(reminderDue(trial(3 * DAY), now), 3);
  assert.equal(reminderDue(trial(2 * DAY - 1000), now), 2);
  assert.equal(reminderDue(trial(1 * DAY), now), 1);
  assert.equal(reminderDue(trial(4 * DAY), now), null);
  assert.equal(reminderDue(trial(-1000), now), null);
});

test("no reminders for blocked companies", () => {
  assert.equal(reminderDue({ ...trial(2 * DAY), status: "BLOCKED" }, now), null);
});

test("blocks once the trial is over and not before", () => {
  assert.equal(shouldBlock(trial(1000), now), false);
  assert.equal(shouldBlock(trial(0), now), true);
  assert.equal(shouldBlock({ ...trial(-DAY), status: "BLOCKED" }, now), false);
});

test("active companies use paidUntil", () => {
  const c = { status: "ACTIVE" as const, trialEndsAt: new Date(now.getTime() - 100 * DAY), paidUntil: new Date(now.getTime() + 2 * DAY) };
  assert.equal(daysLeft(c, now), 2);
  assert.equal(reminderDue(c, now), 2);
});

test("paying during trial keeps the remaining trial days", () => {
  const c = trial(10 * DAY);
  const { start, end } = paidPeriod(c, now);
  assert.equal(start.getTime(), c.trialEndsAt.getTime());
  assert.equal(end.getUTCFullYear(), start.getUTCFullYear() + 1);
});

test("paying after being blocked starts the year today", () => {
  const { start } = paidPeriod({ ...trial(-5 * DAY), status: "BLOCKED" }, now);
  assert.equal(start.getTime(), now.getTime());
});
