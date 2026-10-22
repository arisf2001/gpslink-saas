import { test } from "node:test";
import assert from "node:assert/strict";
import { insideZone, redZoneMessage, zoneDevices } from "../lib/red-zones";

const circle = { lat: 40.61, lng: -75.451, radiusM: 500, geometry: null, bbox: null };
const square = { lat: 0, lng: 0, radiusM: null, geometry: JSON.stringify({ type: "Polygon", coordinates: [[[-76, 40], [-75, 40], [-75, 41], [-76, 41], [-76, 40]]] }), bbox: JSON.stringify([40, 41, -76, -75]) };

test("insideZone uses the radius or the place area", () => {
  assert.equal(insideZone(circle, 40.612, -75.451), true);
  assert.equal(insideZone(circle, 40.62, -75.451), false);
  assert.equal(insideZone(square, 40.5, -75.5), true);
  assert.equal(insideZone(square, 18.47, -69.93), false);
  assert.equal(insideZone(circle, 0, 0), false);
});

test("zoneDevices tolerates bad data", () => {
  assert.deepEqual(zoneDevices({ deviceIds: "[3, \"7\", -1, \"x\"]" }), [3, 7]);
  assert.deepEqual(zoneDevices({ deviceIds: "oops" }), []);
});

test("red zone messages explain the engine stop", () => {
  const p = { deviceId: 1, name: "Camión", plate: "L1", lat: 40.61, lng: -75.45, speed: 45 };
  assert.match(redZoneMessage("enter", { name: "Allentown" }, p, { state: "pending" }).lines.join(" "), /baje a 20 km\/h/);
  assert.match(redZoneMessage("cut", { name: "Allentown" }, p, { state: "sent" }).subject, /Motor apagado/);
  assert.match(redZoneMessage("exit", { name: "Allentown" }, p, { state: null }).subject, /salió/);
});
