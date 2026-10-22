import { trackerUrl } from "./config";
import { trackSsoToken } from "./track-sso";

export type BrandMail = { from_name: string; from_email: string; reply_to: string; test?: { ok: boolean; error: string | null } };

// Reads (and optionally changes) the sender name and reply-to address the tracking platform uses for a white label's clients.
export async function brandMail(gpswoxUserId: number, changes: { fromName?: string; replyTo?: string; testTo?: string } = {}): Promise<BrandMail> {
  const extra: Record<string, unknown> = { scope: "brand-mail" };
  if (changes.fromName !== undefined) extra.from_name = changes.fromName;
  if (changes.replyTo !== undefined) extra.reply_to = changes.replyTo;
  if (changes.testTo) extra.test_to = changes.testTo;
  const res = await fetch(`${trackerUrl()}/gpslink/brand-mail?t=${encodeURIComponent(trackSsoToken(gpswoxUserId, Date.now(), extra))}`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`plataforma ${res.status}`);
  return (await res.json()) as BrandMail;
}
