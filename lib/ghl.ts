import { appUrl, BRAND } from "./config";

const GHL = "https://services.leadconnectorhq.com";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");

export type GhlConfig = { token: string; locationId: string; userId: string };

export function ghlConfig(): GhlConfig | null {
  const token = process.env.GHL_TOKEN ?? "", locationId = process.env.GHL_LOCATION_ID ?? "", userId = process.env.GHL_USER_ID ?? "";
  return token && locationId && userId ? { token, locationId, userId } : null;
}

const headers = (cfg: GhlConfig) => ({ Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json", Accept: "application/json", Version: "2021-07-28" });
const day = (d: Date) => d.toISOString().slice(0, 10);
const message = (body: Obj) => (Array.isArray(body.message) ? body.message.map(String).join("; ") : str(body.message)) || str(body.error);

export function toE164(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+") && digits.length >= 10) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

async function contactId(cfg: GhlConfig, input: { name: string; email: string; phone: string | null }): Promise<string> {
  const [firstName, ...rest] = input.name.trim().split(/\s+/);
  const res = await fetch(`${GHL}/contacts/upsert`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({ locationId: cfg.locationId, firstName: firstName || undefined, lastName: rest.join(" ") || undefined, email: input.email, phone: input.phone || undefined }),
  });
  const body = obj(await res.json().catch(() => ({})));
  const id = str(obj(body.contact).id);
  if (!res.ok || !id) throw new Error(`GHL contacto (${res.status}): ${message(body) || "sin id"}`);
  return id;
}

// Creates the invoice in GHL ("Text2Pay", send mode) and returns its public payment page.
export async function ghlText2Pay(
  cfg: GhlConfig,
  inv: { name: string; email: string; phone: string | null; title: string; items: { desc: string; qty: number; unitCents: number }[]; dueAt: Date; note: string | null },
): Promise<{ id: string; url: string }> {
  const phone = toE164(inv.phone);
  const id = await contactId(cfg, { name: inv.name, email: inv.email, phone });
  const res = await fetch(`${GHL}/invoices/text2pay`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({
      altId: cfg.locationId,
      altType: "location",
      name: inv.title.slice(0, 60),
      title: "INVOICE",
      currency: "USD",
      items: inv.items.map((i) => ({ name: i.desc.slice(0, 120), currency: "USD", amount: i.unitCents / 100, qty: i.qty, type: "one_time" })),
      businessDetails: { name: BRAND.name, logoUrl: `${appUrl()}/logo-gpslink.png`, website: appUrl() },
      contactDetails: { id, name: inv.name, email: inv.email, phoneNo: phone ?? undefined },
      issueDate: day(new Date()),
      dueDate: day(inv.dueAt),
      sentTo: { email: [inv.email] },
      termsNotes: inv.note ? `${inv.title}. ${inv.note}` : inv.title,
      liveMode: true,
      action: "send",
      userId: cfg.userId,
    }),
  });
  const body = obj(await res.json().catch(() => ({})));
  const invoiceId = str(obj(body.invoice)._id);
  const url = str(body.invoiceUrl);
  if (!res.ok || !invoiceId || !url) throw new Error(`GHL factura (${res.status}): ${message(body) || "sin enlace de pago"}`);
  return { id: invoiceId, url };
}

export async function ghlInvoiceStatus(cfg: GhlConfig, invoiceId: string): Promise<string | null> {
  const res = await fetch(`${GHL}/invoices/${encodeURIComponent(invoiceId)}?altId=${encodeURIComponent(cfg.locationId)}&altType=location`, { headers: headers(cfg) });
  if (!res.ok) return null;
  const body = obj(await res.json().catch(() => ({})));
  return str((body.status ? body : obj(body.invoice)).status) || null;
}
