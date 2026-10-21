import nodemailer from "nodemailer";
import { BRAND } from "./config";

export type ChannelResult = { channel: "email" | "whatsapp"; ok: boolean; error?: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function emailHtml(title: string, lines: string[], cta?: { label: string; url: string }, brand: { name: string; contact: string } = { name: BRAND.name, contact: BRAND.supportEmail }): string {
  const body = lines.map((l) => `<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.5">${escapeHtml(l)}</p>`).join("");
  const button = cta
    ? `<p style="margin:20px 0"><a href="${escapeHtml(cta.url)}" style="background:#0F4C5C;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(cta.label)}</a></p>`
    : "";
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px">
<div style="font-weight:800;font-size:20px;color:#0F4C5C;margin-bottom:16px">${escapeHtml(brand.name)}</div>
<h1 style="font-size:20px;color:#0f172a;margin:0 0 16px">${escapeHtml(title)}</h1>${body}${button}
<p style="margin-top:24px;color:#94a3b8;font-size:12px">${escapeHtml(brand.name)} · ${escapeHtml(brand.contact)}</p></div>`;
}

export async function sendEmail(to: string, subject: string, html: string, opts: { fromName?: string; replyTo?: string } = {}): Promise<ChannelResult> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log(`[email:dev] to=${to} subject=${subject}`);
    return { channel: "email", ok: false, error: "SMTP no configurado" };
  }
  try {
    const port = Number(SMTP_PORT ?? 587);
    const transport = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
    const from = opts.fromName ? `"${opts.fromName.replace(/["<>]/g, "")}" <${SMTP_USER}>` : SMTP_FROM ?? `${BRAND.name} <${SMTP_USER}>`;
    await transport.sendMail({ from, to, subject, html, replyTo: opts.replyTo });
    return { channel: "email", ok: true };
  } catch (error) {
    return { channel: "email", ok: false, error: (error as Error).message };
  }
}

export function normalizeWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.length === 10 ? `1${digits}` : digits;
}

// WhatsApp Cloud API (Meta). Messages started by the business need an approved template:
// set WHATSAPP_TEMPLATE to a template with a single {{1}} body variable to carry the text.
export async function sendWhatsApp(phone: string, text: string): Promise<ChannelResult> {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_TEMPLATE, WHATSAPP_TEMPLATE_LANG } = process.env;
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.log(`[whatsapp:dev] to=${phone} text=${text.slice(0, 80)}`);
    return { channel: "whatsapp", ok: false, error: "WhatsApp no configurado" };
  }
  const to = normalizeWhatsAppNumber(phone);
  if (!to) return { channel: "whatsapp", ok: false, error: "Número inválido" };
  const message = WHATSAPP_TEMPLATE
    ? {
        type: "template",
        template: {
          name: WHATSAPP_TEMPLATE,
          language: { code: WHATSAPP_TEMPLATE_LANG ?? "es" },
          components: [{ type: "body", parameters: [{ type: "text", text: text.replace(/\s*\n+\s*/g, " ").slice(0, 1000) }] }],
        },
      }
    : { type: "text", text: { body: text } };
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to, ...message }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { channel: "whatsapp", ok: false, error: `Meta ${res.status}: ${data?.error?.message ?? "error"}` };
    }
    return { channel: "whatsapp", ok: true };
  } catch (error) {
    return { channel: "whatsapp", ok: false, error: (error as Error).message };
  }
}
