import assert from "node:assert/strict";
import { test } from "node:test";
import { borderDistanceKm, nextZoneState, zoneAt } from "../lib/border-zones";

test("measures distance to the Haiti border", () => {
    assert.equal(zoneAt(19.5, -71.73).zone, "roja"); // Dajabón
    assert.equal(zoneAt(18.53, -72.33).zone, "roja"); // Port-au-Prince (inside Haiti)
    assert.equal(borderDistanceKm(18.53, -72.33), 0);
    const sj = zoneAt(18.806, -71.229); // San Juan de la Maguana
    assert.equal(sj.zone, "amarilla");
    assert.ok(sj.km > 30);
    assert.equal(zoneAt(19.55, -71.08).zone, "amarilla"); // Mao
    assert.equal(zoneAt(18.49, -71.85).zone, "roja"); // Jimaní
    assert.equal(zoneAt(19.45, -70.69).zone, null); // Santiago (103 km)
    assert.equal(zoneAt(18.47, -69.9).zone, null); // Santo Domingo
    assert.equal(zoneAt(40.7, -74).zone, null);
    assert.equal(zoneAt(0, 0).zone, null);
  });

test("notifies each zone change and stops the engine only once, at low speed", () => {
    let s = nextZoneState(null, "amarilla", 80, true);
    assert.equal(s.notice, "zone_yellow");
    s = nextZoneState(s.state, "rosada", 80, true);
    assert.equal(s.notice, "zone_pink");
    s = nextZoneState(s.state, "roja", 60, true);
    assert.deepEqual([s.notice, s.cut, s.state.cutState], ["zone_red", false, "pending"]);
    s = nextZoneState(s.state, "roja", 18, true);
    assert.deepEqual([s.notice, s.cut], [null, true]);
    s = nextZoneState({ zone: "roja", cutState: "resumed" }, "roja", 5, true);
    assert.equal(s.cut, false);
    s = nextZoneState(s.state, null, 40, true);
    assert.deepEqual([s.notice, s.state.cutState], ["zone_exit", null]);
    assert.equal(nextZoneState(null, "roja", 0, false).cut, false);
    assert.equal(nextZoneState(null, null, 0, true).notice, null);
  });
