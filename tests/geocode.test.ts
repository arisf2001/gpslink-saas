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

test("timeAgo speaks minutes, hours, days and months", async () => {
  const { timeAgo } = await import("../lib/ai/engine");
  assert.equal(timeAgo(1, "es"), "1 minuto");
  assert.equal(timeAgo(5, "en"), "5 minutes");
  assert.equal(timeAgo(200, "es"), "3 horas y 20 minutos");
  assert.equal(timeAgo(60 * 24 * 3, "es"), "3 días");
  assert.equal(timeAgo(279359, "es"), "6 meses");
  assert.equal(timeAgo(279359, "en"), "6 months");
  assert.equal(timeAgo(null, "es"), null);
});

test("insidePlace handles polygons, holes and multipolygons", async () => {
  const { insidePlace } = await import("../lib/ai/geocode");
  const square = [[-76, 40], [-75, 40], [-75, 41], [-76, 41], [-76, 40]];
  const hole = [[-75.6, 40.4], [-75.4, 40.4], [-75.4, 40.6], [-75.6, 40.6], [-75.6, 40.4]];
  const poly = { geometry: { type: "Polygon", coordinates: [square, hole] }, bbox: [40, 41, -76, -75] as [number, number, number, number] };
  assert.equal(insidePlace(40.8, -75.8, poly), true);
  assert.equal(insidePlace(40.5, -75.5, poly), false);
  assert.equal(insidePlace(18.47, -69.93, poly), false);
  const multi = { geometry: { type: "MultiPolygon", coordinates: [[square], [[[-70, 18], [-69, 18], [-69, 19], [-70, 19], [-70, 18]]]] }, bbox: [18, 41, -76, -69] as [number, number, number, number] };
  assert.equal(insidePlace(18.47, -69.93, multi), true);
  assert.equal(insidePlace(0, 0, multi), false);
});

test("placeFrom names the kind and street of the nearby place", async () => {
  const { placeFrom, placeKind } = await import("../lib/ai/geocode");
  const addr = { address: { road: "Avenida Duarte", city: "Santo Domingo", state: "Distrito Nacional" } };
  const poi = { name: "Shell", category: "amenity", type: "fuel", lat: "18.4800", lon: "-69.9000", address: { road: "Avenida Duarte" } };
  const p = placeFrom(addr, poi, 18.4801, -69.9001, "es");
  assert.equal(p?.nearKind, "estación de combustible");
  assert.equal(p?.nearStreet, "Avenida Duarte");
  assert.equal(placeKind("leisure", "park", "en"), "park");
  assert.equal(placeKind("shop", "unknown_shop", "es"), "tienda");
  assert.equal(placeKind("building", "house", "es"), null);
});
