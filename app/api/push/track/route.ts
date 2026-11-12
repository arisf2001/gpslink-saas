import { parseSubscription, saveSubscription } from "@/lib/push";
import { readTrackSsoToken } from "@/lib/track-sso";

// Called server-to-server by the tracking platform (routes/gpslink_sso.php, gpslink/push) with a signed token for the logged-in user.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const user = typeof body?.token === "string" ? readTrackSsoToken(body.token, "push") : null;
  const sub = parseSubscription(body?.subscription);
  const origin = typeof body?.origin === "string" && /^https:\/\/[a-z0-9.-]+$/i.test(body.origin) ? body.origin.toLowerCase() : null;
  if (!user || !sub) return Response.json({ error: "forbidden" }, { status: 403 });
  await saveSubscription(sub, "track", user.uid, origin);
  return Response.json({ ok: true });
}
