import { test } from "node:test";
import assert from "node:assert/strict";
import { closedPeriod, devicesToBill, monthStart, unitPrice } from "../lib/billing";

const DAY = 86_400_000;

test("billing months use Dominican time", () => {
  assert.equal(monthStart(new Date("2026-11-01T03:00:00Z")).toISOString(), "2026-10-01T04:00:00.000Z");
  assert.equal(monthStart(new Date("2026-11-01T05:00:00Z")).toISOString(), "2026-11-01T04:00:00.000Z");
});

test("closed period is the previous month, due on the 15th", () => {
  const p = closedPeriod(new Date("2026-11-03T12:00:00Z"));
  assert.equal(p.start.toISOString(), "2026-10-01T04:00:00.000Z");
  assert.equal(p.end.toISOString(), "2026-11-01T04:00:00.000Z");
  assert.equal(p.dueAt.toISOString(), "2026-11-16T04:00:00.000Z");
});

test("unit price follows volume tiers", () => {
  const tiers = [{ minDevices: 1, priceCents: 700 }, { minDevices: 26, priceCents: 600 }, { minDevices: 101, priceCents: 500 }];
  assert.equal(unitPrice(tiers, 10), 700);
  assert.equal(unitPrice(tiers, 26), 600);
  assert.equal(unitPrice(tiers, 500), 500);
});

test("bills devices added in the period and yearly anniversaries, not removed ones", () => {
  const end = new Date("2026-11-01T04:00:00Z");
  const d = (id: string, addedDaysAgo: number, nextInDays: number, removed = false) => ({
    id, addedAt: new Date(end.getTime() - addedDaysAgo * DAY), nextBillAt: new Date(end.getTime() + nextInDays * DAY), removedAt: removed ? end : null,
  });
  const r = devicesToBill([d("new", 10, -10), d("renew", 375, -10), d("future", 5, 20), d("gone", 10, -10, true)], end);
  assert.deepEqual(r.items.map((x) => x.id), ["new", "renew"]);
  assert.equal(r.newDevices, 1);
  assert.equal(r.renewals, 1);
});
