import { appUrl } from "@/lib/config";
import { logoutDestination } from "@/lib/brand-web";

// b = white-label reseller of the host the user logged out from; it wins over the user's own brand.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const brandId = Number(params.get("b"));
  const userId = Number(params.get("u"));
  const id = Number.isInteger(brandId) && brandId > 0 ? brandId : userId;
  const destination = Number.isInteger(id) && id > 0 ? await logoutDestination(id) : appUrl();
  return Response.redirect(destination, 303);
}
