import { test } from "node:test";
import assert from "node:assert/strict";
import { nextAlertState, parseOther, signalBars, type DeviceStatus } from "../lib/device-status";

const cfg = { lowBattery: 20, offlineHours: 24 };
const now = new Date("2026-10-21T15:00:00Z");
const dev = (other: string, lastReport: Date | null = now): DeviceStatus => ({ deviceId: 1, name: "Aveo", plate: null, lastReport, ...parseOther(other) });

test("reads battery, signal, satellites and power from the GPS data", () => {
  const t = parseOther("<info><ignition>true</ignition><charge>true</charge><blocked>false</blocked><batterylevel>83</batterylevel><rssi>3</rssi><power>13.34</power><sat>6</sat></info>");
  assert.deepEqual(t, { battery: 83, signal: 3, satellites: 6, charging: true, blocked: false, ignition: true, voltage: 13.34 });
  assert.deepEqual(parseOther(null), { battery: null, signal: null, satellites: null, charging: null, blocked: null, ignition: null, voltage: null });
});

test("signal is shown as 0-4 bars", () => {
  assert.equal(signalBars(4), 4);
  assert.equal(signalBars(24), 3);
  assert.equal(signalBars(31), 4);
  assert.equal(signalBars(-70), null);
});

test("first sight only records a baseline", () => {
  assert.deepEqual(nextAlertState(null, dev("<charge>false</charge><batterylevel>10</batterylevel>"), now, cfg).fire, []);
});

test("alerts fire when a condition starts, once", () => {
  const ok = nextAlertState(null, dev("<charge>true</charge><batterylevel>90</batterylevel>"), now, cfg).state;
  const cut = nextAlertState(ok, dev("<charge>false</charge><batterylevel>15</batterylevel>"), now, cfg);
  assert.deepEqual(cut.fire.sort(), ["low_battery", "power_cut"]);
  assert.deepEqual(nextAlertState(cut.state, dev("<charge>false</charge><batterylevel>14</batterylevel>"), now, cfg).fire, []);
  const off = nextAlertState(ok, dev("<charge>true</charge>", new Date(now.getTime() - 25 * 3_600_000)), now, cfg);
  assert.deepEqual(off.fire, ["offline"]);
});

test("the same alert is not repeated within a day", () => {
  const ok = nextAlertState(null, dev("<charge>true</charge>"), now, cfg).state;
  const cut = nextAlertState(ok, dev("<charge>false</charge>"), now, cfg).state;
  const back = nextAlertState(cut, dev("<charge>true</charge>"), now, cfg).state;
  const h1 = new Date(now.getTime() + 3_600_000);
  const h25 = new Date(now.getTime() + 25 * 3_600_000);
  assert.deepEqual(nextAlertState(back, dev("<charge>false</charge>", h1), h1, cfg).fire, []);
  assert.deepEqual(nextAlertState(back, dev("<charge>false</charge>", h25), h25, cfg).fire, ["power_cut"]);
});
