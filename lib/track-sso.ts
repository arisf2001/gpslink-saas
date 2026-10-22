import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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

// Signed by the tracking platform (routes/gpslink_sso.php) for links that open a gpslinkusa.com page, e.g. scope "soporte".
export function readTrackSsoToken(token: string, scope: string, now = Date.now()): { uid: number; n: string; admin: boolean } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(createHmac("sha256", secret()).update(payload).digest("base64url"));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (d.scope !== scope || !Number.isInteger(d.uid) || typeof d.n !== "string" || !d.n || Number(d.exp) < now / 1000) return null;
    return { uid: d.uid, n: d.n, admin: d.admin === 1 || d.admin === true };
  } catch {
    return null;
  }
}
