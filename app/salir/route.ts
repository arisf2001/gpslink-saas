import { appUrl } from "@/lib/config";
import { logoutDestination } from "@/lib/brand-web";

export async function GET(req: Request) {
  const userId = Number(new URL(req.url).searchParams.get("u"));
  const destination = Number.isInteger(userId) && userId > 0 ? await logoutDestination(userId) : appUrl();
  return Response.redirect(destination, 303);
}
