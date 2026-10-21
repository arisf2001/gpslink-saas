import { appUrl, trackerUrl } from "./config";
import { prisma } from "./db";
import { brandChain } from "./gpswox";

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

// Where a GPSWOX user lands after logging out: the website of its white label, its branded login, or gpslinkusa.com.
export async function logoutDestination(gpswoxUserId: number): Promise<string> {
  const chain = await brandChain(gpswoxUserId).catch(() => []);
  const ids = chain.map((c) => c.id);
  if (ids.length) {
    const companies = await prisma.company.findMany({ where: { gpswoxUserId: { in: ids } }, select: { gpswoxUserId: true, websiteUrl: true } });
    for (const id of ids) {
      const company = companies.find((c) => c.gpswoxUserId === id);
      if (company) return company.websiteUrl || `${trackerUrl()}/login/${id}`;
    }
    const reseller = chain.find((c) => c.reseller);
    if (reseller) return `${trackerUrl()}/login/${reseller.id}`;
  }
  return appUrl();
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function loginSnippet(slug: string, color: string): string {
  const c = /^#[0-9a-f]{3,8}$/i.test(color) ? color : "#0F4C5C";
  const input = "padding:11px 12px;border:1.5px solid #d1d5db;border-radius:10px;font:inherit";
  return `<!-- Entrar a la plataforma de rastreo -->
<form action="${appUrl()}/entrar/externo" method="post" style="display:grid;gap:10px;max-width:360px;font-family:system-ui,sans-serif">
  <input type="hidden" name="empresa" value="${esc(slug)}">
  <input name="email" type="email" placeholder="Correo" autocomplete="username" required style="${input}">
  <input name="password" type="password" placeholder="Contraseña" autocomplete="current-password" required style="${input}">
  <p id="gl-login-error" style="display:none;color:#dc2626;margin:0">Correo o contraseña incorrectos.</p>
  <button type="submit" style="padding:12px;border:0;border-radius:10px;background:${c};color:#fff;font-weight:700;cursor:pointer">Entrar</button>
  <a href="${trackerUrl()}/google/login" style="padding:11px;border:1.5px solid #d1d5db;border-radius:10px;text-align:center;color:#1f2937;text-decoration:none;font-weight:600">Entrar con Google</a>
</form>
<script>if(/[?&]gl_error=/.test(location.search))document.getElementById("gl-login-error").style.display="block";</script>`;
}
