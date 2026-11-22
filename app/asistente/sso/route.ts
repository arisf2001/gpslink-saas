import { resolveUser } from "@/lib/ai/assistant";
import { appUrl } from "@/lib/config";
import { userApiHash } from "@/lib/gpswox";
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

// "Alexa y Gemini" button of the tracking platform: opens the assistant (and its voice connections) already signed in.
export async function GET(req: Request) {
  const data = readTrackSsoToken(new URL(req.url).searchParams.get("t") ?? "", "voz");
  if (!data || !firstUse(data.n)) return Response.redirect(`${appUrl()}/asistente`, 303);
  const hash = await userApiHash(data.uid).catch(() => null);
  const user = hash ? await resolveUser(hash).catch(() => null) : null;
  if (hash && user?.userId === data.uid) await setSession("ia", hash);
  return Response.redirect(`${appUrl()}/asistente#voz`, 303);
}
