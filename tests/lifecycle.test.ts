import { test } from "node:test";
import assert from "node:assert/strict";
import { daysUntil, plusOneYear, reminderDayFor } from "../lib/lifecycle";

const DAY = 86_400_000;
const now = new Date("2026-10-12T15:00:00Z");
const at = (days: number) => new Date(now.getTime() + days * DAY);

test("reminders fire at 3, 2 and 1 days before a date", () => {
  assert.equal(reminderDayFor(at(3), now), 3);
  assert.equal(reminderDayFor(new Date(now.getTime() + 2 * DAY - 1000), now), 2);
  assert.equal(reminderDayFor(at(1), now), 1);
  assert.equal(reminderDayFor(at(4), now), null);
  assert.equal(reminderDayFor(at(-1), now), null);
});

test("days until rounds up", () => {
  assert.equal(daysUntil(new Date(now.getTime() + 1000), now), 1);
});

test("one year later keeps the same day", () => {
  assert.equal(plusOneYear(now).toISOString(), "2027-10-12T15:00:00.000Z");
});
