import { test } from "node:test";
import assert from "node:assert/strict";

import { codeMatches, hashCode, newCode, openPayload, sealPayload } from "../lib/signup-verify";

process.env.SESSION_SECRET ||= "test-secret-test-secret-test-secret-123";

test("signup codes are 6 digits and only match their own verification", () => {
  for (let i = 0; i < 50; i++) assert.match(newCode(), /^\d{6}$/);
  const hash = hashCode("abc", "012345");
  assert.ok(codeMatches("abc", "012345", hash));
  assert.ok(codeMatches("abc", "012 345", hash));
  assert.ok(!codeMatches("abc", "012346", hash));
  assert.ok(!codeMatches("other", "012345", hash));
});

test("pending signup payload is encrypted and tamper-proof", () => {
  const sealed = sealPayload({ email: "a@b.com", password: "Secreta123" });
  assert.ok(!sealed.includes("Secreta123"));
  assert.deepEqual(openPayload(sealed), { email: "a@b.com", password: "Secreta123" });
  const [iv, tag, body] = sealed.split(".");
  assert.equal(openPayload([iv, tag, body.slice(0, -2) + (body.endsWith("A") ? "BB" : "AA")].join(".")), null);
});
