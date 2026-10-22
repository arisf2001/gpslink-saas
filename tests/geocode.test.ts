import { test } from "node:test";
import assert from "node:assert/strict";
import { meters, placeFrom } from "../lib/ai/geocode";

test("placeFrom builds street, city, state and a nearby landmark", () => {
  const addr = { address: { house_number: "211", road: "East Court Street", neighbourhood: "East Side", city: "Allentown", state: "Pensilvania", country: "Estados Unidos" } };
  const poi = { name: "Hanover Park", lat: "40.6105", lon: "-75.4510" };
  const p = placeFrom(addr, poi, 40.61, -75.451);
  assert.equal(p?.street, "East Court Street 211");
  assert.equal(p?.city, "Allentown");
  assert.equal(p?.state, "Pensilvania");
  assert.equal(p?.near, "Hanover Park");
  assert.ok(p!.nearMeters! > 40 && p!.nearMeters! < 70);
});

test("placeFrom ignores far or unnamed points of interest", () => {
  const addr = { address: { road: "Avenida Lope de Vega", city: "Santo Domingo", state: "Distrito Nacional" } };
  assert.equal(placeFrom(addr, { name: "Lejos", lat: "18.50", lon: "-69.93" }, 18.4712, -69.9318)?.near, null);
  assert.equal(placeFrom(addr, { name: "", lat: "18.4712", lon: "-69.9318" }, 18.4712, -69.9318)?.near, null);
  assert.equal(placeFrom(null, null, 0, 0), null);
});

test("meters is roughly correct", () => {
  assert.ok(Math.abs(meters(18.4712, -69.9318, 18.4812, -69.9318) - 1112) < 5);
});
