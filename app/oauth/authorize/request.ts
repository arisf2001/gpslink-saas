import { prisma } from "@/lib/db";
import { normalizeSubdomain } from "@/lib/brand-web";
import { findClient } from "@/lib/oauth";
import { appUrl } from "@/lib/config";

export type AuthorizeRequest = { clientId: string; clientName: string; redirectUri: string; state: string; challenge: string | null; brand: string | null };

// Validates an OAuth authorize request. Errors are shown on our page, never redirected to an unverified URL.
export async function parseAuthorize(q: Record<string, string | undefined>): Promise<AuthorizeRequest | { error: string }> {
  const client = await findClient(q.client_id ?? "");
  if (!client) return { error: "Aplicación desconocida." };
  const redirectUri = q.redirect_uri ?? (client.redirects.length === 1 ? client.redirects[0] : "");
  if (!client.redirects.includes(redirectUri)) return { error: "La dirección de regreso de la aplicación no coincide." };
  if ((q.response_type ?? "code") !== "code") return { error: "Tipo de respuesta no soportado." };
  const challenge = q.code_challenge || null;
  if (challenge && (q.code_challenge_method ?? "plain") !== "S256") return { error: "Método PKCE no soportado." };
  if (!challenge && !client.secretHash) return { error: "La aplicación debe usar PKCE." };
  const fromResource = q.resource?.startsWith(`${appUrl()}/mcp/`) ? q.resource.slice(`${appUrl()}/mcp/`.length).split(/[/?#]/)[0] : "";
  let brand = normalizeSubdomain(q.brand || fromResource || "");
  if (brand && !(await prisma.company.findUnique({ where: { subdomain: brand }, select: { id: true } }))) brand = null;
  return { clientId: client.clientId, clientName: client.name, redirectUri, state: q.state ?? "", challenge, brand };
}
