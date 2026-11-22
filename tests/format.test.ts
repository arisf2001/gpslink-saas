import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney } from "../lib/format";

test("money always uses x,xxx.xx with RD$ / US$", () => {
  assert.equal(formatMoney(3300000, "dop"), "RD$33,000.00");
  assert.equal(formatMoney(275000), "US$2,750.00");
  assert.equal(formatMoney(3200, "DOP"), "RD$32.00");
  assert.equal(formatMoney(550, "usd"), "US$5.50");
  assert.equal(formatMoney(123456789, "usd", "$"), "$1,234,567.89");
  assert.equal(formatMoney(-1000, "usd"), "-US$10.00");
});
