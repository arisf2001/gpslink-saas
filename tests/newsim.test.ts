import { test } from "node:test";
import assert from "node:assert/strict";
import { currentPackage, newsimStatus, packageEs, type NewsimPackage } from "../lib/sim/newsim";

const pkg = (p: Partial<NewsimPackage>): NewsimPackage => ({ salesName: null, status: 1, dataControl: 0, useFlow: 0, activateTime: null, expireTime: null, ...p });

test("portal card status maps to our SIM codes", () => {
  assert.deepEqual([1, 2, 3, 4, 9].map(newsimStatus), [1, 2, 3, 5, 0]);
});

test("current package is the effective one; pending is next", () => {
  const trial = pkg({ salesName: "5M_半年有效_独享_测试_海外", status: 1, dataControl: 5, expireTime: "2026-10-31 23:59:59" });
  const yearly = pkg({ salesName: "30M/月_包年_独享_海外", status: 2, dataControl: 30 });
  assert.deepEqual(currentPackage([trial, yearly]), { current: trial, next: yearly });
  const old = pkg({ status: 3, expireTime: "2025-01-01 00:00:00" });
  assert.equal(currentPackage([old, yearly]).current, old);
  assert.equal(currentPackage([]).current, null);
});

test("package names are translated", () => {
  assert.equal(packageEs("5M_半年有效_独享_测试_海外"), "5M 6 meses prueba");
  assert.equal(packageEs("30M/月_包年_独享_海外"), "30M/mes 1 año");
});
