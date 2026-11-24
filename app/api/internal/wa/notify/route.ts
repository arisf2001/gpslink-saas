import { BRAND } from "@/lib/config";
import { checkInternalKey, OWNER_WA, queueWa, waNumber } from "@/lib/wa";

// credit-saas asks the owner's QR number to write to the owner (his agenda and flight notices) once his Meta chat is closed.
export async function POST(req: Request) {
  if (!checkInternalKey(req.headers.get("x-wa-key"))) return Response.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const phone = waNumber(typeof body.phone === "string" ? body.phone : null);
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 4000) : "";
  if (!phone || !text) return Response.json({ error: "bad_request" }, { status: 400 });
  if (phone !== waNumber(BRAND.ownerWhatsApp)) return Response.json({ ok: false, error: "only_owner" }, { status: 403 });
  return Response.json({ ok: await queueWa(OWNER_WA, phone, text) });
}
