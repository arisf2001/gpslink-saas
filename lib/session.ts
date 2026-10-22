import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

type Role = "admin" | "company" | "ia";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createToken(role: Role, subject: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ role, sub: subject, exp: now + MAX_AGE_SECONDS * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined, role: Role, now = Date.now()): string | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.role !== role || typeof data.sub !== "string" || data.exp < now) return null;
    return data.sub;
  } catch {
    return null;
  }
}

const cookieName = (role: Role) => (role === "admin" ? "gl_admin" : role === "ia" ? "gl_ia" : "gl_company");

export async function setSession(role: Role, subject: string) {
  (await cookies()).set(cookieName(role), createToken(role, subject), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSession(role: Role) {
  (await cookies()).delete(cookieName(role));
}

// Company sessions are "<companyId>" for the owner or "<companyId>:<companyUserId>" for an extra admin, who loses access when deactivated.
export async function getSession(role: Role): Promise<string | null> {
  const sub = verifyToken((await cookies()).get(cookieName(role))?.value, role);
  if (role !== "company" || !sub?.includes(":")) return sub;
  const [companyId, userId] = sub.split(":");
  const { prisma } = await import("./db");
  const user = await prisma.companyUser.findUnique({ where: { id: userId }, select: { companyId: true, active: true } });
  return user?.active && user.companyId === companyId ? companyId : null;
}

export async function getStaffId(): Promise<string | null> {
  const sub = verifyToken((await cookies()).get(cookieName("company"))?.value, "company");
  return sub?.includes(":") ? sub.split(":")[1] : null;
}

export function adminCredentialsMatch(username: string, password: string): boolean {
  const expectedUser = process.env.ADMIN_USERNAME ?? "";
  const expectedPass = process.env.ADMIN_PASSWORD ?? "";
  if (!expectedUser || !expectedPass) return false;
  const a = Buffer.from(`${username}\n${password}`);
  const b = Buffer.from(`${expectedUser}\n${expectedPass}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
