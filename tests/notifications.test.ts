import assert from "node:assert/strict";
import { test } from "node:test";
import { eventMessage, kindForEvent, NOTIFICATIONS } from "../lib/notifications";

test("each GPSWOX event type maps to one notification", () => {
  assert.equal(kindForEvent("zone_in"), "geofence");
  assert.equal(kindForEvent("zone_out"), "geofence");
  assert.equal(kindForEvent("ignition_off"), "ignition");
  assert.equal(kindForEvent("fuel_theft"), "fuel");
  assert.equal(kindForEvent("unknown_type"), null);
  const events = NOTIFICATIONS.flatMap((n) => n.events ?? []);
  assert.equal(new Set(events).size, events.length);
  assert.equal(new Set(NOTIFICATIONS.map((n) => n.key)).size, NOTIFICATIONS.length);
});

test("event message is in Spanish with vehicle, details and brand", () => {
  const m = eventMessage(
    { id: 1, userId: 5, deviceId: 9, type: "overspeed", message: "Overspeed", address: "Av. Kennedy", additional: '{"overspeed_speed":95}', time: new Date("2026-10-12T16:00:00Z"), email: "a@b.com", groupId: 2, device: "Corolla", plate: "A123" },
    "Rastreo RD",
  );
  assert.equal(m.title, "Aviso de Rastreo RD");
  assert.equal(m.lines[0], "Corolla (A123): Exceso de velocidad.");
  assert.ok(m.lines.includes("Velocidad: 95 km/h."));
  assert.ok(m.lines.includes("Lugar: Av. Kennedy"));
  assert.match(m.lines.at(-1)!, /^Hora: 12\/10\/26/);
  const c = eventMessage({ id: 2, userId: 5, deviceId: null, type: "custom", message: "Puerta abierta", address: null, additional: "no-json", time: null, email: null, groupId: 2, device: null, plate: null }, "GPS Link");
  assert.equal(c.lines[0], "Tu vehículo: Puerta abierta.");
});
