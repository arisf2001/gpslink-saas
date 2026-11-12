import assert from "node:assert/strict";
import { test } from "node:test";
import { inPoints } from "../lib/ai/areas";

const square = [
  { lat: 25.564, lng: -80.382 },
  { lat: 25.566, lng: -80.382 },
  { lat: 25.566, lng: -80.380 },
  { lat: 25.564, lng: -80.380 },
];

test("point inside a geofence polygon", () => {
  assert.equal(inPoints(25.565, -80.381, square), true);
});

test("point outside a geofence polygon", () => {
  assert.equal(inPoints(25.567, -80.381, square), false);
  assert.equal(inPoints(25.565, -80.379, square), false);
});
