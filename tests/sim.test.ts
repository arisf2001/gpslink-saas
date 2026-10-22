import { test } from "node:test";
import assert from "node:assert/strict";
import { carrierFor, countryEs, daysLeft, validIccid } from "../lib/sim/carriers";
import { cardExpiry, telebayDate, type TelebayCard } from "../lib/sim/telebay";

test("the carrier is recognized by the longest ICCID prefix", () => {
  const carriers = [
    { code: "telebay", iccidPrefixes: "898522" },
    { code: "otra", iccidPrefixes: "8901, 89852299" },
  ];
  assert.equal(carrierFor("89852240810733417718", carriers), "telebay");
  assert.equal(carrierFor("89852299000000000001", carriers), "otra");
  assert.equal(carrierFor("89011234567890123456", carriers), "otra");
  assert.equal(carrierFor("89340000000000000000", carriers), null);
});

test("ICCID validation", () => {
  assert.ok(validIccid("89852240810733417718"));
  assert.ok(!validIccid("12345"));
  assert.ok(!validIccid("8985224081073341771X"));
});

test("days left until the SIM expires", () => {
  const now = new Date("2027-05-21T12:00:00Z");
  assert.equal(daysLeft(new Date("2027-05-31T15:59:59Z"), now), 11);
  assert.equal(daysLeft(new Date("2027-05-31T11:00:00Z"), now), 10);
  assert.equal(daysLeft(new Date("2027-05-20T12:00:00Z"), now), -1);
  assert.equal(daysLeft(null, now), null);
});

test("Telebay dates are China time and the expiry is the latest package end", () => {
  assert.equal(telebayDate("2027-05-31 23:59:59")?.toISOString(), "2027-05-31T15:59:59.000Z");
  assert.equal(telebayDate(null), null);
  const card = { iccid: "1", endTime: null, zyCardPackageDTO: [{ endTime: "2027-03-01 00:00:00" }, { endTime: "2027-09-01 00:00:00" }] } as unknown as TelebayCard;
  assert.equal(cardExpiry(card)?.toISOString(), "2027-08-31T16:00:00.000Z");
  assert.equal(cardExpiry({ iccid: "2", endTime: null, zyCardPackageDTO: [] } as unknown as TelebayCard), null);
});

test("country names from the provider are shown in Spanish", () => {
  assert.equal(countryEs("多米尼加共和国"), "República Dominicana");
  assert.equal(countryEs("美利坚合众国"), "Estados Unidos");
  assert.equal(countryEs("Narnia"), "Narnia");
  assert.equal(countryEs(null), "");
});
