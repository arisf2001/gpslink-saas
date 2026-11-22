import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const CODE_TTL_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const MAX_RESENDS = 3;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return value;
}

export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashCode(id: string, code: string): string {
  return createHmac("sha256", secret()).update(`signup:${id}:${code}`).digest("hex");
}

export function codeMatches(id: string, code: string, codeHash: string): boolean {
  const given = Buffer.from(hashCode(id, code.replace(/\D/g, "")));
  const expected = Buffer.from(codeHash);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function key(): Buffer {
  return createHash("sha256").update(`signup-payload:${secret()}`).digest();
}

export function sealPayload(data: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function openPayload<T>(sealed: string): T | null {
  try {
    const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8")) as T;
  } catch {
    return null;
  }
}
