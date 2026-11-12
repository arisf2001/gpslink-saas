import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readTrackSsoToken } from "../lib/track-sso";

process.env.TRACK_SSO_SECRET = "x".repeat(40);

// Same encoding as routes/gpslink_sso.php (base64 → strtr '+/' '-_' → rtrim '=').
const b64 = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function phpToken(data: object, key = process.env.TRACK_SSO_SECRET!) {
  const payload = b64(Buffer.from(JSON.stringify(data)));
  return `${payload}.${b64(createHmac("sha256", key).update(payload).digest())}`;
}
const now = Date.now();
const exp = Math.floor(now / 1000) + 60;

test("reads a support token signed by the tracking platform", () => {
  assert.deepEqual(readTrackSsoToken(phpToken({ scope: "soporte", uid: 70, admin: 0, exp, n: "abc" }), "soporte", now), { uid: 70, n: "abc", admin: false });
});

test("rejects wrong scope, expired, tampered or foreign-key tokens", () => {
  assert.equal(readTrackSsoToken(phpToken({ uid: 70, exp, n: "a" }), "soporte", now), null);
  assert.equal(readTrackSsoToken(phpToken({ scope: "brand-mail", uid: 70, exp, n: "a" }), "soporte", now), null);
  assert.equal(readTrackSsoToken(phpToken({ scope: "soporte", uid: 70, exp: exp - 120, n: "a" }), "soporte", now), null);
  assert.equal(readTrackSsoToken(phpToken({ scope: "soporte", uid: 70, exp, n: "a" }, "y".repeat(40)), "soporte", now), null);
  const [p, s] = phpToken({ scope: "soporte", uid: 70, exp, n: "a" }).split(".");
  assert.equal(readTrackSsoToken(`${p}x.${s}`, "soporte", now), null);
});
