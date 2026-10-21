import { rateLimit, resolveUser } from "@/lib/ai/assistant";
import { login } from "@/lib/ai/gps";
import { appUrl } from "@/lib/config";
import { prisma } from "@/lib/db";
import { trackSsoToken } from "@/lib/track-sso";
import { platformOriginFor } from "@/lib/brand-web";

// Target of the login box that white labels paste on their own website.
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const slug = String(form?.get("empresa") ?? "").slice(0, 100);
  const company = slug ? await prisma.company.findUnique({ where: { slug }, select: { websiteUrl: true } }) : null;
  const back = (code: string) => {
    const url = new URL(company?.websiteUrl || `${appUrl()}/entrar`);
    url.searchParams.set("gl_error", code);
    return Response.redirect(url.toString(), 303);
  };
  const email = String(form?.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(form?.get("password") ?? "").slice(0, 200);
  if (!email || !password) return back("1");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimit(`track-login:${ip}`, 10) > 0 || rateLimit(`track-login:${email}`, 5) > 0) return back("2");
  const hash = await login(email, password).catch(() => null);
  if (!hash) return back("1");
  const user = await resolveUser(hash).catch(() => null);
  if (!user?.userId) return back("3");
  return Response.redirect(`${await platformOriginFor(user.userId)}/gpslink-sso?t=${encodeURIComponent(trackSsoToken(user.userId))}`, 303);
}
