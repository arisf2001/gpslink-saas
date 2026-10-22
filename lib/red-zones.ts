import type { RowDataPacket } from "mysql2/promise";
import type { RedZone } from "@prisma/client";
import { addGeofence, deleteGeofence } from "./ai/gps";
import { findPlace, insidePlace, meters } from "./ai/geocode";
import { adminSender, CUT_SPEED_KMH, engineSequence, HOW_TO_RESUME, userDeviceIds, userSender } from "./border-zones";
import { prisma } from "./db";
import { alertSetting, deviceUsers } from "./device-status";
import { isMock, userPhone, withGpswoxDb } from "./gpswox";
import { notificationRules, notify, type Channels, type Message } from "./notifications";

// Customer red zones (created through the assistant): alert on entry and stop the engine at <= 20 km/h, like the Haiti border red zone.
export const MAX_ZONE_KM = 200;
type Shape = Pick<RedZone, "lat" | "lng" | "radiusM" | "geometry" | "bbox">;
type ZoneUser = { userId: number; hash: string };

export function insideZone(z: Shape, lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return false;
  if (z.radiusM) return meters(z.lat, z.lng, lat, lng) <= z.radiusM;
  if (z.geometry && z.bbox) return insidePlace(lat, lng, { geometry: JSON.parse(z.geometry), bbox: JSON.parse(z.bbox) });
  return false;
}

export function zoneDevices(z: Pick<RedZone, "deviceIds">): number[] {
  try {
    const ids = JSON.parse(z.deviceIds);
    return Array.isArray(ids) ? ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  } catch {
    return [];
  }
}

export function zoneShape(z: Pick<RedZone, "radiusM">, lang: "es" | "en"): string {
  if (!z.radiusM) return lang === "en" ? "the whole area of the place" : "toda el área del lugar";
  const km = z.radiusM / 1000;
  return lang === "en" ? `${km} km around the place` : `${km} km alrededor del lugar`;
}

export function parseCoords(text: string): { lat: number; lng: number } | null {
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(text);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? { lat, lng } : null;
}

export async function createRedZone(userId: number, input: { place: string; point?: { lat: number; lng: number } | null; radiusKm?: number | null; deviceIds: number[]; name?: string | null }, lang: "es" | "en"): Promise<RedZone | { error: string }> {
  const point = input.point ?? parseCoords(input.place);
  if (point) {
    const radiusKm = Math.min(Math.max(input.radiusKm && input.radiusKm > 0 ? input.radiusKm : 1, 0.1), MAX_ZONE_KM);
    const name = (input.name?.trim() || input.place.trim() || `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`).slice(0, 120);
    return prisma.redZone.create({ data: { gpswoxUserId: userId, name, lat: point.lat, lng: point.lng, radiusM: Math.round(radiusKm * 1000), deviceIds: JSON.stringify([...new Set(input.deviceIds)].slice(0, 500)) } });
  }
  const found = await findPlace(input.place, lang);
  if (!found) return { error: "Place not found; ask the customer for the place with its city and state or country" };
  const [s, n, w, e] = found.bbox;
  const radiusKm = input.radiusKm && input.radiusKm > 0 ? Math.min(Math.max(input.radiusKm, 0.1), MAX_ZONE_KM) : null;
  const polygon = !radiusKm && (found.geometry.type === "Polygon" || found.geometry.type === "MultiPolygon");
  const name = (input.name?.trim() || found.name.split(",")[0]).slice(0, 120);
  return prisma.redZone.create({
    data: {
      gpswoxUserId: userId, name, lat: (s + n) / 2, lng: (w + e) / 2,
      radiusM: polygon ? null : Math.round((radiusKm ?? 1) * 1000),
      geometry: polygon ? JSON.stringify(found.geometry) : null, bbox: polygon ? JSON.stringify(found.bbox) : null,
      deviceIds: JSON.stringify([...new Set(input.deviceIds)].slice(0, 500)),
    },
  });
}

function outerRing(geometry: string): [number, number][] | null {
  const g = JSON.parse(geometry) as { type: string; coordinates: unknown };
  const rings = g.type === "Polygon" ? [(g.coordinates as number[][][])[0]] : g.type === "MultiPolygon" ? (g.coordinates as number[][][][]).map((p) => p[0]) : [];
  const ring = rings.sort((a, b) => b.length - a.length)[0];
  if (!ring?.length) return null;
  const step = Math.ceil(ring.length / 300);
  return ring.filter((_, i) => i % step === 0).map(([lng, lat]) => [lng, lat] as [number, number]);
}

export async function activateRedZone(user: ZoneUser, zoneId: string): Promise<RedZone | null> {
  const zone = await prisma.redZone.findFirst({ where: { id: zoneId, gpswoxUserId: user.userId } });
  if (!zone) return null;
  let geofenceId = zone.geofenceId;
  if (!geofenceId) {
    const ring = zone.geometry ? outerRing(zone.geometry) : null;
    const shape = zone.radiusM ? { lat: zone.lat, lng: zone.lng, radiusM: zone.radiusM } : ring ? { ring } : null;
    geofenceId = shape ? await addGeofence(user.hash, `Zona roja: ${zone.name}`, shape).catch((e) => (console.error("[zona-roja] geofence", e), null)) : null;
  }
  return prisma.redZone.update({ where: { id: zone.id }, data: { active: true, geofenceId } });
}

export async function deleteRedZone(user: ZoneUser, zoneId: string): Promise<RedZone | null> {
  const zone = await prisma.redZone.findFirst({ where: { id: zoneId, gpswoxUserId: user.userId } });
  if (!zone) return null;
  if (zone.geofenceId) await deleteGeofence(user.hash, zone.geofenceId).catch((e) => console.error("[zona-roja] geofence delete", e));
  await prisma.redZoneState.deleteMany({ where: { zoneId: zone.id } });
  await prisma.redZone.delete({ where: { id: zone.id } });
  return zone;
}

export const listRedZones = (userId: number) => prisma.redZone.findMany({ where: { gpswoxUserId: userId }, orderBy: { createdAt: "asc" } });

type Position = { deviceId: number; name: string; plate: string | null; lat: number; lng: number; speed: number };

async function positionsFor(ids: number[]): Promise<Position[]> {
  if (!ids.length) return [];
  if (isMock()) {
    const rows = await prisma.mockDevice.findMany({ where: { id: { in: ids }, lat: { not: null }, lng: { not: null } } });
    return rows.map((d) => ({ deviceId: d.id, name: d.name ?? `Equipo ${d.id}`, plate: null, lat: d.lat!, lng: d.lng!, speed: d.speed ?? 0 }));
  }
  return withGpswoxDb(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT d.id, d.name, d.plate_number, t.lastValidLatitude AS lat, t.lastValidLongitude AS lng, t.speed
         FROM devices d JOIN traccar_devices t ON t.id = d.traccar_device_id
        WHERE d.id IN (?) AND d.deleted = 0 AND t.server_time > UTC_TIMESTAMP() - INTERVAL 1 DAY`,
      [ids],
    );
    return rows.map((r) => ({ deviceId: Number(r.id), name: String(r.name || `Equipo ${r.id}`), plate: r.plate_number ? String(r.plate_number) : null, lat: Number(r.lat), lng: Number(r.lng), speed: Number(r.speed ?? 0) }));
  });
}

const mapLink = (p: Position) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

export function redZoneMessage(kind: "enter" | "cut" | "exit", zone: Pick<RedZone, "name">, p: Position, cut: { state: string | null; error?: string }): Message {
  const vehicle = p.plate ? `${p.name} (${p.plate})` : p.name;
  const where = `Ubicación: ${mapLink(p)}`;
  if (kind === "exit") return { subject: `${vehicle} salió de la zona roja ${zone.name}`, title: "Salió de la zona roja", lines: [`${vehicle} salió de la zona roja «${zone.name}».`, where] };
  const status =
    cut.state === "sent" ? "Se envió la orden de APAGAR el motor." :
    cut.state === "pending" ? `El motor se apagará en cuanto baje a ${CUT_SPEED_KMH} km/h o menos (ahora va a ${p.speed.toFixed(0)} km/h).` :
    cut.state === "failed" ? `No se pudo apagar el motor (${cut.error ?? "el equipo no respondió"}).` :
    "El apagado automático está desactivado en esta zona.";
  const resume = cut.state === "sent" || cut.state === "pending" ? [HOW_TO_RESUME] : [];
  if (kind === "cut") return { subject: `Motor apagado: ${vehicle} en zona roja ${zone.name}`, title: `Zona roja: ${zone.name}`, lines: [`${vehicle} está en la zona roja «${zone.name}».`, status, ...resume, where] };
  return { subject: `EMERGENCIA: ${vehicle} entró a la zona roja ${zone.name}`, title: `EMERGENCIA: zona roja ${zone.name}`, lines: [`${vehicle} entró a la zona roja «${zone.name}».`, status, ...resume, where] };
}

async function send(kind: string, zone: RedZone, p: Position, msg: Message, rules: Map<string, Channels>) {
  const billed = await prisma.billedDevice.findFirst({ where: { deviceId: p.deviceId, removedAt: null }, include: { company: true } });
  const company = billed?.company && billed.company.status !== "CANCELED" ? billed.company : null;
  const done = new Set<string>();
  const owner = (await deviceUsers([p.deviceId])).find((u) => u.userId === zone.gpswoxUserId);
  const phone = await userPhone(zone.gpswoxUserId).catch(() => null);
  await notify(kind, { gpswoxUserId: zone.gpswoxUserId, email: owner?.email ?? null, phone, companyId: company?.id ?? null }, msg, { rules, done });
  await prisma.deviceAlert.create({ data: { deviceId: p.deviceId, deviceName: p.name, companyId: company?.id ?? null, kind: `red_${kind}`, sentTo: done.size } });
}

export async function runRedZones(): Promise<{ checked: number; notices: number; cuts: number }> {
  const summary = { checked: 0, notices: 0, cuts: 0 };
  const setting = await alertSetting();
  if (!setting.enabled) return summary;
  const zones = await prisma.redZone.findMany({ where: { active: true } });
  if (!zones.length) return summary;
  const saved = new Map((await prisma.redZoneState.findMany({ where: { zoneId: { in: zones.map((z) => z.id) } } })).map((s) => [`${s.zoneId}:${s.deviceId}`, s]));
  const rules = await notificationRules();
  const byUser = new Map<number, RedZone[]>();
  for (const z of zones) byUser.set(z.gpswoxUserId, [...(byUser.get(z.gpswoxUserId) ?? []), z]);
  for (const [userId, list] of byUser) {
    const owned = new Set(await userDeviceIds(userId));
    const wanted = new Set<number>();
    for (const z of list) {
      const ids = zoneDevices(z);
      for (const id of ids.length ? ids : owned) if (owned.has(id)) wanted.add(id);
    }
    const pos = await positionsFor([...wanted]);
    for (const z of list) {
      const ids = zoneDevices(z);
      for (const p of pos) {
        if (ids.length && !ids.includes(p.deviceId)) continue;
        summary.checked++;
        const key = `${z.id}:${p.deviceId}`;
        const prev = saved.get(key);
        const inside = insideZone(z, p.lat, p.lng);
        if (!inside) {
          if (prev) {
            await prisma.redZoneState.delete({ where: { zoneId_deviceId: { zoneId: z.id, deviceId: p.deviceId } } });
            await send("zone_exit", z, p, redZoneMessage("exit", z, p, { state: null }), rules);
            summary.notices++;
          }
          continue;
        }
        let cutState = prev ? prev.cutState : z.cut ? "pending" : null;
        const cutNow = cutState === "pending" && p.speed <= CUT_SPEED_KMH;
        let error: string | undefined;
        if (cutNow) {
          const r = await engineSequence(p.deviceId, true, adminSender(p.deviceId));
          cutState = r.ok ? "sent" : "failed";
          error = r.error;
          if (r.ok) summary.cuts++;
        }
        if (!prev || cutNow) {
          await prisma.redZoneState.upsert({
            where: { zoneId_deviceId: { zoneId: z.id, deviceId: p.deviceId } },
            create: { zoneId: z.id, deviceId: p.deviceId, cutState, cutAt: cutNow ? new Date() : null, cutError: error?.slice(0, 250) ?? null },
            update: { cutState, cutAt: new Date(), cutError: error?.slice(0, 250) ?? null },
          });
          await send("zone_red", z, p, redZoneMessage(prev ? "cut" : "enter", z, p, { state: cutState, error }), rules);
          summary.notices++;
        }
      }
    }
  }
  return summary;
}

// WhatsApp ENCENDER / APAGAR after a red zone notice: acts on the owner's most recent vehicle inside one of his red zones.
export async function redZoneEngineReply(user: ZoneUser, word: string): Promise<string | null> {
  const zones = await prisma.redZone.findMany({ where: { gpswoxUserId: user.userId }, select: { id: true } });
  if (!zones.length) return null;
  const state = await prisma.redZoneState.findFirst({ where: { zoneId: { in: zones.map((z) => z.id) } }, orderBy: { updatedAt: "desc" } });
  if (!state) return null;
  const resume = word === "encender";
  const r = await engineSequence(state.deviceId, !resume, userSender(user.hash, state.deviceId));
  if (r.error && r.ok) return `Se envió la orden, pero falló una parte: ${r.error}.`;
  if (!r.ok) return `No se pudo ${resume ? "encender" : "apagar"} el vehículo: ${r.error}. Inténtalo desde la app o la web.`;
  await prisma.redZoneState.update({ where: { zoneId_deviceId: { zoneId: state.zoneId, deviceId: state.deviceId } }, data: { cutState: resume ? "resumed" : "sent" } });
  return resume ? "Listo, se envió la orden de ENCENDER el motor." : "Listo, se envió la orden de APAGAR el motor. Para encenderlo responde ENCENDER.";
}
