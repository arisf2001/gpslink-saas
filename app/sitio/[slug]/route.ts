import { platformOriginFor } from "@/lib/brand-web";
import { trackerUrl } from "@/lib/config";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { renderSite, siteFor } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: RouteContext<"/sitio/[slug]">) {
  const { slug } = await ctx.params;
  const company = await prisma.company.findUnique({ where: { slug } });
  if (!company) return new Response("No encontrado", { status: 404 });
  const site = siteFor(company);
  const wantsPreview = new URL(req.url).searchParams.has("vista");
  const canPreview = wantsPreview && ((await getSession("company")) === company.id || !!(await getSession("admin")));
  if (!site.published && !canPreview) return new Response("Esta página todavía no está publicada.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const platform = company.gpswoxUserId ? await platformOriginFor(company.gpswoxUserId).catch(() => trackerUrl()) : trackerUrl();
  return new Response(renderSite(site, platform, canPreview), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
