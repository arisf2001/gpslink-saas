import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/config";

export async function GET(request: NextRequest) {
  const lang = request.nextUrl.searchParams.get("l") === "en" ? "en" : "es";
  const next = request.nextUrl.searchParams.get("next") ?? "/";
  (await cookies()).set("lang", lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return NextResponse.redirect(new URL(next.startsWith("/") && !next.startsWith("//") ? next : "/", appUrl()));
}
