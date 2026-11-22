import { resolveUser } from "@/lib/ai/assistant";
import { SessionError } from "@/lib/ai/gps";
import { smartHome, type SmartHomeRequest } from "@/lib/google-home";
import { userFromBearer } from "@/lib/oauth";

// Google Home cloud-to-cloud fulfillment (SYNC / QUERY / EXECUTE / DISCONNECT), authenticated with our OAuth tokens.
export async function POST(req: Request) {
  const linked = await userFromBearer(req);
  if (!linked) return Response.json({ error: "invalid_token" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as SmartHomeRequest | null;
  if (!body?.requestId || !Array.isArray(body.inputs)) return Response.json({ error: "bad_request" }, { status: 400 });
  try {
    const user = await resolveUser(linked.hash);
    const access = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")![1].trim();
    return Response.json(await smartHome(body, user, access));
  } catch (e) {
    if (e instanceof SessionError) return Response.json({ error: "invalid_token" }, { status: 401 });
    console.error("[google]", e);
    return Response.json({ requestId: body.requestId, payload: { errorCode: "transientError" } });
  }
}
