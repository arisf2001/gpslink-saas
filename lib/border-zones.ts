import type { RowDataPacket } from "mysql2/promise";
import { sendCommand, sendCustom } from "./ai/gps";
import { HAITI_BORDER, HAITI_OUTLINE } from "./border-data";
import { prisma } from "./db";
import { alertSetting, deviceUsers } from "./device-status";
import { adminCommand, isMock, withGpswoxDb } from "./gpswox";
import { notificationRules, notify, type Message } from "./notifications";

// Zones along the Haiti border, measured from the border line (a vehicle inside Haiti counts as distance 0).
export type Zone = "roja" | "rosada" | "amarilla";
export const ZONES: { zone: Zone; km: number; kind: string; label: string }[] = [
  { zone: "roja", km: 10, kind: "zone_red", label: "Zona roja" },
  { zone: "rosada", km: 30, kind: "zone_pink", label: "Zona rosada" },
  { zone: "amarilla", km: 100, kind: "zone_yellow", label: "Zona amarilla" },
];
export const CUT_SPEED_KMH = 20;
// Vehicles with the Bluetooth fuel-pump relay get a second order 10 s after the engine order (GT06 "DY" = off, "KY" = on).
export const BLUE_OFF = "DY";
export const BLUE_ON = "KY";
export const RELAY_DELAY_MS = 10_000;

export async function bluetoothRelayDevices(ids: number[]): Promise<Set<number>> {
  if (!ids.length) return new Set();
  if (isMock()) return new Set((await prisma.mockDevice.findMany({ where: { id: { in: ids }, name: { contains: "BLE" } } })).map((d) => d.id));
  return withGpswoxDb(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT DISTINCT ctd.device_id FROM command_template_devices ctd JOIN command_templates ct ON ct.id = ctd.command_template_id WHERE ct.message IN (?, ?) AND ctd.device_id IN (?)",
      [BLUE_OFF, BLUE_ON, ids],
    );
    return new Set(rows.map((r) => Number(r.device_id)));
  });
}

type Sender = { engine: (stop: boolean) => Promise<{ ok: boolean; error?: string }>; custom: (data: string) => Promise<{ ok: boolean; error?: string }> };

// Engine stop/resume, then (if the vehicle has the Bluetooth relay) the fuel pump order 10 seconds later.
export async function engineSequence(deviceId: number, stop: boolean, send: Sender, delayMs = RELAY_DELAY_MS): Promise<{ ok: boolean; error?: string }> {
  const first = await send.engine(stop).catch((e) => ({ ok: false, error: String(e) }));
  if (!(await bluetoothRelayDevices([deviceId])).has(deviceId)) return first;
  await new Promise((r) => setTimeout(r, delayMs));
  const relay = await send.custom(stop ? BLUE_OFF : BLUE_ON).catch((e) => ({ ok: false, error: String(e) }));
  if (first.ok && relay.ok) return { ok: true };
  return { ok: first.ok || relay.ok, error: [first.ok ? null : `motor: ${first.error}`, relay.ok ? null : `bomba (Bluetooth): ${relay.error}`].filter(Boolean).join("; ") };
}
export const adminSender = (deviceId: number): Sender => ({ engine: (stop) => adminCommand(deviceId, stop ? "engineStop" : "engineResume"), custom: (data) => adminCommand(deviceId, "custom", data) });
export const userSender = (hash: string, deviceId: number): Sender => ({ engine: (stop) => sendCommand(hash, deviceId, stop ? "engine_stop" : "engine_resume"), custom: (data) => sendCustom(hash, deviceId, data) });

function insideHaiti(lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = HAITI_OUTLINE.length - 1; i < HAITI_OUTLINE.length; j = i++) {
    const [xi, yi] = HAITI_OUTLINE[i];
    const [xj, yj] = HAITI_OUTLINE[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function borderDistanceKm(lat: number, lng: number): number {
  if (insideHaiti(lng, lat)) return 0;
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  const ky = 110.574;
  let best = Infinity;
  for (const line of HAITI_BORDER) {
    for (let i = 1; i < line.length; i++) {
      const ax = (line[i - 1][0] - lng) * kx, ay = (line[i - 1][1] - lat) * ky;
      const bx = (line[i][0] - lng) * kx, by = (line[i][1] - lat) * ky;
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}

export function zoneAt(lat: number, lng: number): { zone: Zone | null; km: number } {
  if (lat < 16 || lat > 21.5 || lng < -75.5 || lng > -67.5 || (lat === 0 && lng === 0)) return { zone: null, km: Infinity };
  const km = borderDistanceKm(lat, lng);
  return { zone: ZONES.find((z) => km <= z.km)?.zone ?? null, km };
}

export type CutState = "pending" | "sent" | "failed" | "resumed" | null;
export type ZoneState = { zone: Zone | null; cutState: CutState };

// Pure transition: which notice to send and whether to send the engine stop now.
export function nextZoneState(prev: ZoneState | null, zone: Zone | null, speed: number, cutEnabled: boolean): { state: ZoneState; notice: string | null; cut: boolean } {
  const before = prev?.zone ?? null;
  let notice: string | null = null;
  if (zone !== before) notice = zone ? ZONES.find((z) => z.zone === zone)!.kind : before ? "zone_exit" : null;
  let cutState: CutState = prev?.cutState ?? null;
  if (zone !== "roja") cutState = null;
  else if (before !== "roja") cutState = cutEnabled ? "pending" : null;
  const cut = cutState === "pending" && speed <= CUT_SPEED_KMH;
  return { state: { zone, cutState }, notice, cut };
}

type Position = { deviceId: number; name: string; plate: string | null; lat: number; lng: number; speed: number; cut?: boolean };

async function positions(): Promise<Position[]> {
  if (isMock()) {
    const rows = await prisma.mockDevice.findMany({ where: { lat: { not: null }, lng: { not: null } } });
    return rows.map((d) => ({ deviceId: d.id, name: d.name ?? `Equipo ${d.id}`, plate: null, lat: d.lat!, lng: d.lng!, speed: d.speed ?? 0 }));
  }
  return withGpswoxDb(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT d.id, d.name, d.plate_number, t.lastValidLatitude AS lat, t.lastValidLongitude AS lng, t.speed, COALESCE(z.cut, 1) AS cut
         FROM devices d JOIN traccar_devices t ON t.id = d.traccar_device_id
         LEFT JOIN gpslink_zone_devices z ON z.device_id = d.id
        WHERE d.deleted = 0 AND t.server_time > UTC_TIMESTAMP() - INTERVAL 1 DAY AND COALESCE(z.alerts, 1) = 1
          AND t.lastValidLatitude BETWEEN 16 AND 21.5 AND t.lastValidLongitude BETWEEN -75.5 AND -67.5`,
    );
    return rows.map((r) => ({ deviceId: Number(r.id), name: String(r.name || `Equipo ${r.id}`), plate: r.plate_number ? String(r.plate_number) : null, lat: Number(r.lat), lng: Number(r.lng), speed: Number(r.speed ?? 0), cut: Number(r.cut) !== 0 }));
  });
}

const mapLink = (p: Position) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
export const HOW_TO_RESUME = "Para encenderlo de nuevo responde ENCENDER a este mensaje de WhatsApp, o usa «Encender motor» en la app o en la web.";

function zoneMessage(kind: string, p: Position, km: number, cut: { state: CutState; error?: string }): Message {
  const vehicle = p.plate ? `${p.name} (${p.plate})` : p.name;
  const dist = `${km < 1 ? "menos de 1" : km.toFixed(0)} km de la frontera con Haití`;
  const where = `Ubicación: ${mapLink(p)}`;
  if (kind === "zone_exit") return { subject: `${vehicle} salió de las zonas de la frontera`, title: "Salió de las zonas de la frontera", lines: [`${vehicle} ya está a más de 100 km de la frontera con Haití.`, where] };
  if (kind !== "zone_red") {
    const z = ZONES.find((x) => x.kind === kind)!;
    return { subject: `${z.label}: ${vehicle}`, title: `${z.label}: cerca de la frontera con Haití`, lines: [`${vehicle} está a ${dist} (${z.label.toLowerCase()}, menos de ${z.km} km).`, `Velocidad: ${p.speed.toFixed(0)} km/h.`, where] };
  }
  const status =
    cut.state === "sent" ? "Se envió la orden de APAGAR el motor." :
    cut.state === "pending" ? `El motor se apagará en cuanto baje a ${CUT_SPEED_KMH} km/h o menos (ahora va a ${p.speed.toFixed(0)} km/h).` :
    cut.state === "failed" ? `No se pudo apagar el motor (${cut.error ?? "el equipo no respondió"}).` :
    "El apagado automático está desactivado.";
  return { subject: `EMERGENCIA: ${vehicle} en zona roja`, title: "EMERGENCIA: zona roja, frontera con Haití", lines: [`${vehicle} está a ${dist}.`, status, ...(cut.state === "sent" || cut.state === "pending" ? [HOW_TO_RESUME] : []), where] };
}

export async function runBorderZones(): Promise<{ checked: number; notices: number; cuts: number }> {
  const setting = await alertSetting();
  const summary = { checked: 0, notices: 0, cuts: 0 };
  if (!setting.enabled || !setting.zonesEnabled) return summary;
  const list = await positions();
  const saved = new Map((await prisma.borderZoneState.findMany()).map((s) => [s.deviceId, s]));
  const work: { p: Position; km: number; notice: string | null; cut: boolean; state: ZoneState }[] = [];
  const seen = new Set<number>();
  for (const p of list) {
    seen.add(p.deviceId);
    summary.checked++;
    const { zone, km } = zoneAt(p.lat, p.lng);
    const prev = saved.get(p.deviceId);
    const next = nextZoneState(prev ? { zone: prev.zone as Zone | null, cutState: prev.cutState as CutState } : null, zone, p.speed, setting.zoneCut && p.cut !== false);
    if (!prev && !zone) continue;
    if (next.notice || next.cut || next.state.zone !== (prev?.zone ?? null) || next.state.cutState !== (prev?.cutState ?? null)) work.push({ p, km, ...next });
  }
  // Devices that left the region (e.g. drove far east) leave their zone too.
  for (const s of saved.values()) if (s.zone && !seen.has(s.deviceId)) await prisma.borderZoneState.update({ where: { deviceId: s.deviceId }, data: { zone: null, cutState: null } });
  if (!work.length) return summary;

  const ids = work.map((w) => w.p.deviceId);
  const users = await deviceUsers(ids);
  const billed = await prisma.billedDevice.findMany({ where: { deviceId: { in: ids }, removedAt: null }, include: { company: true } });
  const rules = await notificationRules();
  for (const w of work) {
    let cut: { state: CutState; error?: string } = { state: w.state.cutState };
    if (w.cut) {
      const r = await engineSequence(w.p.deviceId, true, adminSender(w.p.deviceId));
      cut = r.ok ? { state: "sent" } : { state: "failed", error: r.error };
      summary.cuts += r.ok ? 1 : 0;
    }
    await prisma.borderZoneState.upsert({
      where: { deviceId: w.p.deviceId },
      create: { deviceId: w.p.deviceId, zone: w.state.zone, cutState: cut.state, cutAt: w.cut ? new Date() : null, cutError: cut.error?.slice(0, 250) ?? null },
      update: { zone: w.state.zone, cutState: cut.state, ...(w.cut ? { cutAt: new Date(), cutError: cut.error?.slice(0, 250) ?? null } : {}) },
    });
    // A pending stop that just went out gets its own red notice; otherwise only zone changes notify.
    const kind = w.notice ?? (w.cut ? "zone_red" : null);
    if (!kind) continue;
    const company = billed.find((b) => b.deviceId === w.p.deviceId)?.company ?? null;
    const active = company && company.status !== "CANCELED" ? company : null;
    const msg = zoneMessage(kind, w.p, w.km, cut);
    const done = new Set<string>();
    const owners = users.filter((u) => u.deviceId === w.p.deviceId && u.groupId !== 1);
    for (const o of owners.length ? owners : [{ userId: null, email: null, phone: null }]) await notify(kind, { gpswoxUserId: o.userId, email: o.email, phone: o.phone, companyId: active?.id ?? null }, msg, { rules, done });
    await prisma.deviceAlert.create({ data: { deviceId: w.p.deviceId, deviceName: w.p.name, companyId: active?.id ?? null, kind, sentTo: done.size } });
    summary.notices++;
  }
  return summary;
}

export async function userDeviceIds(userId: number): Promise<number[]> {
  if (isMock()) return (await prisma.mockDevice.findMany({ where: { gpswoxUserId: userId }, select: { id: true } })).map((d) => d.id);
  return withGpswoxDb(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT device_id FROM user_device_pivot WHERE user_id = ?", [userId]);
    return rows.map((r) => Number(r.device_id));
  });
}

// WhatsApp reply ENCENDER / APAGAR to a border notice: acts on the owner's most recent vehicle in a border zone.
export async function borderEngineReply(user: { userId: number; hash: string }, word: string): Promise<string | null> {
  const ids = await userDeviceIds(user.userId);
  if (!ids.length) return null;
  const state = await prisma.borderZoneState.findFirst({ where: { deviceId: { in: ids }, zone: { not: null } }, orderBy: { updatedAt: "desc" } });
  if (!state) return null;
  const resume = word === "encender";
  const r = await engineSequence(state.deviceId, !resume, userSender(user.hash, state.deviceId));
  if (r.error && r.ok) return `Se envió la orden, pero falló una parte: ${r.error}.`;
  if (!r.ok) return `No se pudo ${resume ? "encender" : "apagar"} el vehículo: ${r.error}. Inténtalo desde la app o la web.`;
  await prisma.borderZoneState.update({ where: { deviceId: state.deviceId }, data: { cutState: resume ? "resumed" : "sent" } });
  await prisma.deviceAlert.create({ data: { deviceId: state.deviceId, deviceName: `Equipo ${state.deviceId}`, kind: resume ? "zone_resume_wa" : "zone_stop_wa", sentTo: 0 } });
  return resume ? "Listo, se envió la orden de ENCENDER el motor." : "Listo, se envió la orden de APAGAR el motor. Para encenderlo responde ENCENDER.";
}
