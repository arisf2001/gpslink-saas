import { accountLoginUrl, requestOrigin } from "@/lib/brand-host";
import { appUrl } from "@/lib/config";
import { prisma } from "@/lib/db";
import { setSession } from "@/lib/session";
import { readTrackSsoToken } from "@/lib/track-sso";

const used = new Map<string, number>();
function firstUse(nonce: string): boolean {
  const now = Date.now();
  for (const [n, t] of used) if (t < now) used.delete(n);
  if (used.has(nonce)) return false;
  used.set(nonce, now + 5 * 60_000);
  return true;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// "Soporte" button of the tracking platform: opens the white label's tickets already signed in.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  const origin = await requestOrigin();
  const data = readTrackSsoToken(token, "soporte");
  if (!data) return Response.redirect(`${origin}/cuenta`, 303);
  const company = await prisma.company.findFirst({ where: { gpswoxUserId: data.uid } });
  if (!company) {
    if (data.admin) return Response.redirect(`${appUrl()}/admin/tickets`, 303);
    const dealer = await prisma.endClient.findFirst({ where: { gpswoxUserId: data.uid }, include: { company: { select: { name: true, email: true, phone: true } } } });
    const who = dealer ? `${esc(dealer.company.name)}: ${esc(dealer.company.email)}${dealer.company.phone ? ` · ${esc(dealer.company.phone)}` : ""}` : "la empresa que te dio la cuenta.";
    return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Soporte</title><body style="font-family:system-ui;max-width:520px;margin:60px auto;padding:0 16px"><h2>Soporte</h2><p>Tu soporte lo da ${who}</p></body>`, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  const base = new URL(accountLoginUrl(company)).origin;
  if (base !== origin) return Response.redirect(`${base}/cuenta/sso?t=${encodeURIComponent(token)}`, 303);
  if (firstUse(data.n)) await setSession("company", company.id);
  return Response.redirect(`${base}/cuenta/soporte`, 303);
}
