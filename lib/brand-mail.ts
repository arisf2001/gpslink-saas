import { trackerUrl } from "./config";
import { trackSsoToken } from "./track-sso";

export type BrandSmtp = { enabled: boolean; provider: string; host: string; port: number; security: "ssl" | "tls" | ""; username: string; from_email: string; has_password: boolean };
export type BrandLayout = { enabled: boolean; color: string; logo_url: string; footer: string };
export type BrandTemplate = { name: string; title: string; note: string; custom: boolean };
export type BrandMail = {
  from_name: string;
  from_email: string;
  reply_to: string;
  smtp?: BrandSmtp;
  smtp_status?: { ok: boolean; error: string | null; at: number } | null;
  layout?: BrandLayout | null;
  templates?: BrandTemplate[];
  test?: { ok: boolean; error: string | null };
};

export type BrandMailChanges = {
  fromName?: string;
  replyTo?: string;
  testTo?: string;
  testBrandSmtp?: boolean;
  smtp?: (Omit<BrandSmtp, "has_password"> & { password?: string }) | null;
  layout?: BrandLayout;
  templates?: boolean;
  templateSave?: { name: string; title: string; note: string }[];
  templateReset?: string[];
};

// Reads (and optionally changes) how the tracking platform emails a white label's clients: sender, own mail server, design and templates.
export async function brandMail(gpswoxUserId: number, changes: BrandMailChanges = {}): Promise<BrandMail> {
  const extra: Record<string, unknown> = { scope: "brand-mail" };
  if (changes.fromName !== undefined) extra.from_name = changes.fromName;
  if (changes.replyTo !== undefined) extra.reply_to = changes.replyTo;
  if (changes.testTo) extra.test_to = changes.testTo;
  if (changes.testBrandSmtp) extra.test_brand_smtp = 1;
  if (changes.smtp !== undefined) extra.smtp = changes.smtp;
  if (changes.layout) extra.layout = changes.layout;
  if (changes.templates) extra.templates = 1;
  if (changes.templateSave?.length) extra.template_save = changes.templateSave;
  if (changes.templateReset?.length) extra.template_reset = changes.templateReset;
  const res = await fetch(`${trackerUrl()}/gpslink/brand-mail`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ t: trackSsoToken(gpswoxUserId, Date.now(), extra) }),
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`plataforma ${res.status}`);
  return (await res.json()) as BrandMail;
}
