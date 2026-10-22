import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { appUrl, trackerUrl } from "./config";
import { prisma } from "./db";
import { brandChain } from "./gpswox";

export function brandRootDomain(): string {
  return process.env.BRAND_ROOT_DOMAIN || "gpslinkusa.com";
}

export function brandOrigin(subdomain: string): string {
  return `https://${subdomain}.${brandRootDomain()}`;
}

const RESERVED = new Set([
  "www", "track", "mail", "webmail", "smtp", "imap", "pop", "pop3", "ftp", "sftp", "admin", "api", "app", "apps", "autodiscover",
  "autoconfig", "cpanel", "ns", "ns1", "ns2", "mx", "dns", "gpslink", "soporte", "support", "ayuda", "help", "blog", "shop", "tienda",
  "demo", "test", "dev", "staging", "static", "cdn", "assets", "status", "panel", "login", "cuenta", "web", "ia", "wa", "whatsapp", "sim",
]);

export function normalizeSubdomain(value: string): string | null {
  const sub = value.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(sub) || sub.includes("--") || RESERVED.has(sub)) return null;
  return sub;
}

export function normalizeWebsite(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!["https:", "http:"].includes(url.protocol) || raw.length > 300) return null;
    return url.toString();
  } catch {
    return null;
  }
}

// Nearest white label (registered company) above a GPSWOX user, plus the nearest GPSWOX reseller as fallback.
async function brandFor(gpswoxUserId: number) {
  const chain = await brandChain(gpswoxUserId).catch(() => []);
  const ids = chain.map((c) => c.id);
  const companies = ids.length
    ? await prisma.company.findMany({ where: { gpswoxUserId: { in: ids } }, select: { gpswoxUserId: true, websiteUrl: true, subdomain: true } })
    : [];
  for (const id of ids) {
    const company = companies.find((c) => c.gpswoxUserId === id);
    if (company) return { resellerId: id, company };
  }
  const reseller = chain.find((c) => c.reseller);
  return reseller ? { resellerId: reseller.id, company: null } : null;
}

// Platform origin a user should be sent to after logging in: its white label's subdomain, or track.
export async function platformOriginFor(gpswoxUserId: number): Promise<string> {
  const brand = await brandFor(gpswoxUserId);
  return brand?.company?.subdomain ? brandOrigin(brand.company.subdomain) : trackerUrl();
}

// Where a GPSWOX user lands after logging out: its white label's website, its subdomain, its branded login, or gpslinkusa.com.
export async function logoutDestination(gpswoxUserId: number): Promise<string> {
  const brand = await brandFor(gpswoxUserId);
  if (!brand) return appUrl();
  if (brand.company?.websiteUrl) return brand.company.websiteUrl;
  if (brand.company?.subdomain) return `${brandOrigin(brand.company.subdomain)}/login`;
  return `${trackerUrl()}/login/${brand.resellerId}`;
}

// GPSWOX reads this file to show each white label's brand on its own subdomain.
export async function writeBrandMap(): Promise<void> {
  const file = process.env.GPSWOX_BRANDS_FILE;
  if (!file) return;
  const companies = await prisma.company.findMany({
    where: { gpswoxUserId: { not: null }, OR: [{ subdomain: { not: null } }, { customDomain: { not: null } }] },
    select: { subdomain: true, customDomain: true, gpswoxUserId: true },
  });
  const map = Object.fromEntries(
    companies.flatMap((c) => [
      ...(c.subdomain ? [`${c.subdomain}.${brandRootDomain()}`] : []),
      ...(c.customDomain ? [c.customDomain, `www.${c.customDomain}`] : []),
    ].map((host) => [host, c.gpswoxUserId])),
  );
  await mkdir(dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(map), { mode: 0o644 });
  await rename(`${file}.tmp`, file);
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function loginSnippet(slug: string, color: string, platformOrigin: string): string {
  const c = /^#[0-9a-f]{3,8}$/i.test(color) ? color : "#0F4C5C";
  const input = "padding:11px 12px;border:1.5px solid #d1d5db;border-radius:10px;font:inherit";
  return `<!-- Entrar a la plataforma de rastreo -->
<form action="${appUrl()}/entrar/externo" method="post" style="display:grid;gap:10px;max-width:360px;font-family:system-ui,sans-serif">
  <input type="hidden" name="empresa" value="${esc(slug)}">
  <input name="email" type="email" placeholder="Correo" autocomplete="username" required style="${input}">
  <input name="password" type="password" placeholder="Contraseña" autocomplete="current-password" required style="${input}">
  <p id="gl-login-error" style="display:none;color:#dc2626;margin:0">Correo o contraseña incorrectos.</p>
  <button type="submit" style="padding:12px;border:0;border-radius:10px;background:${c};color:#fff;font-weight:700;cursor:pointer">Entrar</button>
  <a href="${platformOrigin}/google/login" style="padding:11px;border:1.5px solid #d1d5db;border-radius:10px;text-align:center;color:#1f2937;text-decoration:none;font-weight:600">Entrar con Google</a>
</form>
<script>if(/[?&]gl_error=/.test(location.search))document.getElementById("gl-login-error").style.display="block";</script>`;
}
