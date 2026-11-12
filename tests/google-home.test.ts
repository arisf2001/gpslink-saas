import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceFor, stateFor } from "../lib/google-home";

test("vehicles are security panels with ignition and battery", () => {
  const d = deviceFor({ id: 44, name: "Explorer ST", plate: "G123" });
  assert.equal(d.id, "44");
  assert.equal(d.type, "action.devices.types.SECURITYSYSTEM");
  assert.ok(d.traits.includes("action.devices.traits.ArmDisarm"));
  assert.ok(d.traits.includes("action.devices.traits.Locator"));
  assert.deepEqual(d.name.nicknames, ["G123"]);
  assert.equal(d.attributes.queryOnlyOnOff, true);
});

test("state maps blocked engine, ignition and battery", () => {
  const s = stateFor({ online: "online", engine: true }, { battery: 62, blocked: true });
  assert.equal(s.isArmed, true);
  assert.equal(s.on, true);
  assert.equal(s.online, true);
  assert.deepEqual(s.capacityRemaining, [{ rawValue: 62, unit: "PERCENTAGE" }]);
  assert.equal(s.descriptiveCapacityRemaining, "MEDIUM");
  const off = stateFor({ online: "offline", engine: null }, undefined);
  assert.equal(off.online, false);
  assert.equal(off.isArmed, false);
  assert.equal("capacityRemaining" in off, false);
});
