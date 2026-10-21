import { test } from "node:test";
import assert from "node:assert/strict";
import { assignSlots, deviceExpirations, plusOneYear, reminderDayFor, renewedEnd, shouldBlock, trialReminderDue, usableSlots, type SlotState } from "../lib/lifecycle";

const DAY = 86_400_000;
const now = new Date("2026-10-12T15:00:00Z");
const at = (days: number) => new Date(now.getTime() + days * DAY);
const trial = (msLeft: number) => ({ status: "TRIAL" as const, trialEndsAt: new Date(now.getTime() + msLeft) });
const slot = (id: string, createdAt: Date, extra: Partial<SlotState> = {}): SlotState => ({ id, deviceId: null, startsAt: null, endsAt: null, createdAt, ...extra });

test("trial reminders fire at 3, 2 and 1 days before it ends", () => {
  assert.equal(trialReminderDue(trial(3 * DAY), now), 3);
  assert.equal(trialReminderDue(trial(2 * DAY - 1000), now), 2);
  assert.equal(trialReminderDue(trial(1 * DAY), now), 1);
  assert.equal(trialReminderDue(trial(4 * DAY), now), null);
  assert.equal(trialReminderDue({ ...trial(2 * DAY), status: "ACTIVE" }, now), null);
});

test("blocks once the trial is over, only while in trial", () => {
  assert.equal(shouldBlock(trial(1000), now), false);
  assert.equal(shouldBlock(trial(0), now), true);
  assert.equal(shouldBlock({ ...trial(-DAY), status: "ACTIVE" }, now), false);
});

test("each device starts its own year on the day it is added", () => {
  const slots = [slot("a", at(-10)), slot("b", at(-10)), slot("c", at(-10))];
  const devices = [{ id: 1, createdAt: at(-2) }, { id: 2, createdAt: at(0) }];
  const { slots: next, changed } = assignSlots(slots, devices, now);
  assert.equal(changed.length, 2);
  assert.equal(next[0].deviceId, 1);
  assert.equal(next[0].startsAt?.getTime(), at(-2).getTime());
  assert.equal(next[0].endsAt?.getTime(), plusOneYear(at(-2)).getTime());
  assert.equal(next[1].deviceId, 2);
  assert.equal(next[2].deviceId, null);
  assert.equal(next[2].endsAt, null);
  assert.equal(usableSlots(next, now), 3);
});

test("devices added before paying start their year on the payment day", () => {
  const { slots } = assignSlots([slot("a", now)], [{ id: 1, createdAt: at(-30) }], now);
  assert.equal(slots[0].startsAt?.getTime(), now.getTime());
});

test("devices beyond the paid slots stay unpaid and expire with the trial", () => {
  const trialEnd = at(-1);
  const devices = [{ id: 1, createdAt: at(-5) }, { id: 2, createdAt: at(-4) }];
  const { slots } = assignSlots([slot("a", now)], devices, now);
  const exp = deviceExpirations(slots, devices, trialEnd);
  assert.equal(exp.get(1)?.getTime(), plusOneYear(now).getTime());
  assert.equal(exp.get(2)?.getTime(), trialEnd.getTime());
});

test("a slot freed by a deleted device keeps its running year for the next device", () => {
  const running = slot("a", at(-100), { deviceId: 9, startsAt: at(-100), endsAt: at(265) });
  const { slots } = assignSlots([running], [{ id: 10, createdAt: at(0) }], now);
  assert.equal(slots[0].deviceId, 10);
  assert.equal(slots[0].endsAt?.getTime(), at(265).getTime());
});

test("an expired device waits for renewal and does not use up a free slot", () => {
  const old = slot("old", at(-400), { deviceId: 1, startsAt: at(-400), endsAt: at(-35) });
  const fresh = slot("new", now);
  const { slots, changed } = assignSlots([old, fresh], [{ id: 1, createdAt: at(-400) }], now);
  assert.equal(changed.length, 0);
  assert.equal(slots[0].deviceId, 1);
  assert.equal(slots[1].deviceId, null);
  assert.equal(usableSlots(slots, now), 1);
});

test("renewal continues the year, or starts today if it already expired", () => {
  assert.equal(renewedEnd(at(10), now).getTime(), plusOneYear(at(10)).getTime());
  assert.equal(renewedEnd(at(-10), now).getTime(), plusOneYear(now).getTime());
});

test("device reminders use the same 3, 2, 1 days", () => {
  assert.equal(reminderDayFor(at(3), now), 3);
  assert.equal(reminderDayFor(at(5), now), null);
});
