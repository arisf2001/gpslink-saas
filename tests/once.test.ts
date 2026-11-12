import { test } from "node:test";
import assert from "node:assert/strict";
import { onceImei, onceStatus } from "../lib/sim/once";

test("1NCE status maps to our SIM codes", () => {
  assert.deepEqual(["Enabled", "Disabled", "Deleted", "x"].map(onceStatus), [2, 3, 5, 0]);
});

test("1NCE IMEISV is cut to 15 digits", () => {
  assert.equal(onceImei("8644210656147201"), "864421065614722");
  assert.equal(onceImei("8638740875069501"), "863874087506956");
  assert.equal(onceImei("864421065614722"), "864421065614722");
  assert.equal(onceImei(null), null);
});
