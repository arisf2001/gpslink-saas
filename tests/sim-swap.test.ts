import { test } from "node:test";
import assert from "node:assert/strict";
import { possibleSwap } from "../lib/sim/carriers";
import { lastUseDay } from "../lib/sim/once";

const now = new Date("2026-10-22T12:00:00Z");
const h = (n: number) => new Date(now.getTime() - n * 3_600_000);

test("possible SIM swap: device reporting, SIM idle more than 3 days", () => {
  assert.equal(possibleSwap(h(24 * 4), h(1), now), true);
  assert.equal(possibleSwap(h(24 * 2), h(1), now), false);
  assert.equal(possibleSwap(h(24 * 10), h(30), now), false);
  assert.equal(possibleSwap(null, h(1), now), false);
  assert.equal(possibleSwap(h(24 * 10), null, now), false);
});

test("1NCE last usage day", () => {
  const z = { volume: "0" };
  assert.equal(lastUseDay([{ date: "2026-10-21", data: z }, { date: "2026-10-19", data: { volume: "0.19" } }, { date: "2026-10-18", data: { volume: "0.1" } }])?.toISOString(), "2026-10-19T23:59:59.000Z");
  assert.equal(lastUseDay([{ date: "2026-10-21", data: z }]), null);
});
