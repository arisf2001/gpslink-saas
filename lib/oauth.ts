import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { appUrl } from "./config";
import { prisma } from "./db";
import { openPayload, sealPayload } from "./signup-verify";

const CODE_TTL_MS = 5 * 60_000;
const ACCESS_TTL_MS = 60 * 60_000;
const REFRESH_TTL_MS = 365 * 24 * 60 * 60_000;

export const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const token = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function issuer(): string {
  return appUrl();
}

export function authServerMetadata() {
  const base = issuer();
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: ["vehicles"],
  };
}

export function validRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    return u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname));
  } catch {
    return false;
  }
}

export async function registerClient(input: { name: string; redirectUris: string[]; withSecret: boolean }) {
  const clientId = `gl_${token(18)}`;
  const secret = input.withSecret ? token(32) : null;
  await prisma.oAuthClient.create({ data: { clientId, secretHash: secret ? sha(secret) : null, name: input.name.slice(0, 120), redirectUris: JSON.stringify(input.redirectUris) } });
  return { clientId, secret };
}

export async function findClient(clientId: string) {
  const c = clientId ? await prisma.oAuthClient.findUnique({ where: { clientId } }) : null;
  return c ? { ...c, redirects: JSON.parse(c.redirectUris) as string[] } : null;
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function issueCode(input: { clientId: string; redirectUri: string; challenge: string | null; gpswoxHash: string; brand: string | null }): Promise<string> {
  const code = token(32);
  await prisma.oAuthCode.create({ data: { codeHash: sha(code), clientId: input.clientId, redirectUri: input.redirectUri, challenge: input.challenge, sealedHash: sealPayload({ h: input.gpswoxHash }), brand: input.brand, expiresAt: new Date(Date.now() + CODE_TTL_MS) } });
  return code;
}

async function newTokens(clientId: string, sealedHash: string, brand: string | null) {
  const access = token(32);
  const refresh = token(32);
  await prisma.oAuthToken.create({ data: { accessHash: sha(access), refreshHash: sha(refresh), clientId, sealedHash, brand, expiresAt: new Date(Date.now() + ACCESS_TTL_MS), refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS) } });
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_MS / 1000, refresh_token: refresh, scope: "vehicles" };
}

export type TokenError = { error: string; error_description: string };

// Client auth: public clients (PKCE) send no secret; confidential clients (Alexa) must send the right secret.
export async function exchange(params: URLSearchParams, basic: { id: string; secret: string } | null): Promise<Record<string, unknown> | TokenError> {
  const clientId = basic?.id || params.get("client_id") || "";
  const secret = basic?.secret || params.get("client_secret") || "";
  const client = await findClient(clientId);
  if (!client) return { error: "invalid_client", error_description: "Unknown client" };
  if (client.secretHash && !sameHash(sha(secret), client.secretHash)) return { error: "invalid_client", error_description: "Bad client secret" };
  const grant = params.get("grant_type");

  if (grant === "authorization_code") {
    const row = await prisma.oAuthCode.findUnique({ where: { codeHash: sha(params.get("code") ?? "") } });
    if (row) await prisma.oAuthCode.delete({ where: { id: row.id } });
    if (!row || row.clientId !== clientId || row.expiresAt < new Date()) return { error: "invalid_grant", error_description: "Code expired or invalid" };
    if (params.get("redirect_uri") && params.get("redirect_uri") !== row.redirectUri) return { error: "invalid_grant", error_description: "redirect_uri mismatch" };
    if (row.challenge) {
      const verifier = params.get("code_verifier") ?? "";
      if (createHash("sha256").update(verifier).digest("base64url") !== row.challenge) return { error: "invalid_grant", error_description: "PKCE check failed" };
    } else if (!client.secretHash) {
      return { error: "invalid_grant", error_description: "PKCE required" };
    }
    return newTokens(clientId, row.sealedHash, row.brand);
  }

  if (grant === "refresh_token") {
    const row = await prisma.oAuthToken.findUnique({ where: { refreshHash: sha(params.get("refresh_token") ?? "") } });
    if (!row || row.clientId !== clientId || row.refreshExpiresAt < new Date()) return { error: "invalid_grant", error_description: "Refresh token expired or invalid" };
    await prisma.oAuthToken.delete({ where: { id: row.id } });
    return newTokens(clientId, row.sealedHash, row.brand);
  }

  return { error: "unsupported_grant_type", error_description: "Use authorization_code or refresh_token" };
}

export async function userFromBearer(req: Request): Promise<{ hash: string; brand: string | null; clientId: string } | null> {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  return m ? userFromAccessToken(m[1].trim()) : null;
}

export async function userFromAccessToken(access: string): Promise<{ hash: string; brand: string | null; clientId: string } | null> {
  if (!access) return null;
  const row = await prisma.oAuthToken.findUnique({ where: { accessHash: sha(access) } });
  if (!row || row.expiresAt < new Date()) return null;
  const sealed = openPayload<{ h: string }>(row.sealedHash);
  return sealed?.h ? { hash: sealed.h, brand: row.brand, clientId: row.clientId } : null;
}

// Removes every token of one GPS Link session (used when GPS Link says the hash is no longer valid).
export async function revokeByAccess(access: string) {
  await prisma.oAuthToken.deleteMany({ where: { accessHash: sha(access) } });
}
