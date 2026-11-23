import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { mapUrl } from "@/lib/ai/gps";
import { alertKey, OWNER_WA, queueWa, waNumber } from "@/lib/wa";

type AlertEvent = {
  message?: string;
  type?: string;
  address?: string;
  speed?: number | string;
  latitude?: number | string;
  longitude?: number | string;
  device?: { name?: string };
  user?: { id?: number; phone_number?: string | null };
};

// GPSWOX calls this for alerts the AI created (create_alert): the customer also gets the alert on WhatsApp.
export async function POST(req: Request) {
  const url = new URL(req.url);
  const userId = Number(url.searchParams.get("u"));
  const k = Buffer.from(url.searchParams.get("k") ?? "");
  const expected = Buffer.from(Number.isInteger(userId) && userId > 0 ? alertKey(userId) : "");
  if (!expected.length || k.length !== expected.length || !timingSafeEqual(k, expected)) return new Response("forbidden", { status: 403 });
  const e = (await req.json().catch(() => ({}))) as AlertEvent;
  const link = await prisma.waLink.findFirst({ where: { gpswoxUserId: userId }, orderBy: { updatedAt: "desc" }, select: { phone: true } });
  // The stored link is used only when the account has no phone at all: never a number the admin replaced.
  const phone = e.user?.phone_number ? (waNumber(e.user.phone_number) ? e.user.phone_number : null) : (link?.phone ?? null);
  if (!phone) return Response.json({ ok: false, error: "no_phone" });
  const lat = Number(e.latitude);
  const lng = Number(e.longitude);
  const text = [
    `Alerta: ${e.device?.name ?? "tu vehículo"} · ${e.message || e.type || "evento"}`,
    e.address ? `Dirección: ${e.address}` : "",
    Number(e.speed) > 0 ? `Velocidad: ${Math.round(Number(e.speed))} km/h` : "",
    Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? `Ver en el mapa: ${mapUrl(lat, lng)}` : "",
  ].filter(Boolean).join("\n");
  return Response.json({ ok: await queueWa(OWNER_WA, phone, text) });
}
