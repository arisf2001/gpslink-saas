import { createHmac, randomBytes } from "node:crypto";

function secret(): string {
  const value = process.env.TRACK_SSO_SECRET;
  if (!value || value.length < 32) throw new Error("TRACK_SSO_SECRET must be set (32+ chars)");
  return value;
}

// Must match routes/gpslink_sso.php on the tracking platform.
export function trackSsoToken(gpswoxUserId: number, now = Date.now(), extra: Record<string, unknown> = {}): string {
  const payload = Buffer.from(JSON.stringify({ ...extra, uid: gpswoxUserId, exp: Math.floor(now / 1000) + 60, n: randomBytes(16).toString("hex") })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}
