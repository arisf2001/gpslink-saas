import type { RowDataPacket } from "mysql2/promise";
import { prisma } from "./db";
import { notificationRules, notify } from "./notifications";
import { isMock, withGpswoxDb } from "./gpswox";

// Battery, GSM signal, satellites, power and relay state that each GPS sends to GPS Link (traccar_devices.other).
// Read-only access to the GPSWOX database.

export type DeviceTelemetry = {
  battery: number | null;
  signal: number | null;
  satellites: number | null;
  charging: boolean | null;
  blocked: boolean | null;
  ignition: boolean | null;
  voltage: number | null;
};

export type DeviceStatus = DeviceTelemetry & { deviceId: number; name: string; plate: string | null; lastReport: Date | null };

export type AlertConfig = { lowBattery: number; offlineHours: number };

function tag(xml: string, key: string): string | null {
  const m = new RegExp(`<${key}>([^<]*)</${key}>`).exec(xml);
  return m ? m[1].trim() : null;
}

const num = (v: string | null) => (v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const bool = (v: string | null) => (v === "true" || v === "1" ? true : v === "false" || v === "0" ? false : null);

// GT06-style devices report 0-4; others report the modem CSQ (0-31).
export function signalBars(rssi: number | null): number | null {
  if (rssi === null || rssi < 0) return null;
  if (rssi <= 5) return Math.min(4, Math.round(rssi));
  if (rssi <= 31) return Math.min(4, Math.round((rssi * 4) / 31));
  return null;
}

export function parseOther(xml: string | null | undefined): DeviceTelemetry {
  const x = xml ?? "";
  const battery = num(tag(x, "batterylevel"));
  return {
    battery: battery === null ? null : Math.max(0, Math.min(100, Math.round(battery))),
    signal: signalBars(num(tag(x, "rssi"))),
    satellites: num(tag(x, "sat")) ?? num(tag(x, "satvisible")),
    charging: bool(tag(x, "charge")),
    blocked: bool(tag(x, "blocked")),
    ignition: bool(tag(x, "ignition")),
    voltage: num(tag(x, "power")),
  };
}

// Devices by id, or every active device when ids is null.
export async function deviceStatuses(ids: number[] | null): Promise<DeviceStatus[]> {
  if (ids && !ids.length) return [];
  if (isMock()) {
    const rows = await prisma.mockDevice.findMany({ where: ids ? { id: { in: ids } } : {} });
    return rows.map((d) => ({ deviceId: d.id, name: d.name ?? `Equipo ${d.id}`, plate: null, lastReport: d.reportedAt, ...parseOther(d.other) }));
  }
  return withGpswoxDb(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT d.id, d.name, d.plate_number, t.other, DATE_FORMAT(t.server_time, '%Y-%m-%dT%H:%i:%sZ') AS reported
         FROM devices d LEFT JOIN traccar_devices t ON t.id = d.traccar_device_id
        WHERE d.deleted = 0 ${ids ? "AND d.id IN (?)" : ""}`,
      ids ? [ids] : [],
    );
    return rows.map((r) => ({
      deviceId: Number(r.id),
      name: String(r.name || `Equipo ${r.id}`),
      plate: r.plate_number ? String(r.plate_number) : null,
      lastReport: r.reported ? new Date(String(r.reported)) : null,
      ...parseOther(r.other as string | null),
    }));
  });
}

export async function deviceUsers(ids: number[]): Promise<{ userId: number; deviceId: number; email: string | null; groupId: number }[]> {
  if (!ids.length) return [];
  if (isMock()) return (await prisma.mockDevice.findMany({ where: { id: { in: ids } } })).map((d) => ({ userId: d.gpswoxUserId, deviceId: d.id, email: null, groupId: 2 }));
  return withGpswoxDb(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT p.user_id, p.device_id, u.email, u.group_id FROM user_device_pivot p JOIN users u ON u.id = p.user_id WHERE p.device_id IN (?)", [ids]);
    return rows.map((r) => ({ userId: Number(r.user_id), deviceId: Number(r.device_id), email: r.email ? String(r.email) : null, groupId: Number(r.group_id) }));
  });
}

export async function alertSetting() {
  return (await prisma.alertSetting.findUnique({ where: { id: 1 } })) ?? prisma.alertSetting.create({ data: { id: 1 } });
}

export const isOffline = (s: DeviceStatus, now: Date, cfg: AlertConfig) => !!s.lastReport && now.getTime() - s.lastReport.getTime() > cfg.offlineHours * 3_600_000;
export const isLowBattery = (s: DeviceStatus, cfg: AlertConfig) => s.battery !== null && s.battery < cfg.lowBattery && s.charging !== true;

export function problems(s: DeviceStatus, now: Date, cfg: AlertConfig): string[] {
  const out: string[] = [];
  if (!s.lastReport) out.push("Nunca ha reportado");
  else if (isOffline(s, now, cfg)) out.push(`Más de ${cfg.offlineHours} h sin reportar`);
  if (isLowBattery(s, cfg)) out.push("Batería baja");
  if (s.charging === false) out.push("Sin corriente");
  return out;
}

export type AlertKind = "low_battery" | "power_cut" | "offline";
const ALERT_LABEL: Record<AlertKind, string> = { low_battery: "Batería baja", power_cut: "Desconectado de la corriente", offline: "Sin reportar" };
export type AlertState = { low: boolean; offline: boolean; charging: boolean | null; sent: Partial<Record<AlertKind, number>> };

const DAY_MS = 86_400_000;

// First sight of a device only records a baseline; afterwards an alert fires when a condition starts, at most once a day per kind.
export function nextAlertState(prev: AlertState | null, s: DeviceStatus, now: Date, cfg: AlertConfig): { state: AlertState; fire: AlertKind[] } {
  const state: AlertState = { low: isLowBattery(s, cfg), offline: isOffline(s, now, cfg), charging: s.charging, sent: { ...(prev?.sent ?? {}) } };
  if (!prev) return { state, fire: [] };
  const fire: AlertKind[] = [];
  if (state.low && !prev.low) fire.push("low_battery");
  if (prev.charging === true && s.charging === false) fire.push("power_cut");
  if (state.offline && !prev.offline) fire.push("offline");
  const allowed = fire.filter((k) => !state.sent[k] || now.getTime() - state.sent[k]! >= DAY_MS);
  for (const k of allowed) state.sent[k] = now.getTime();
  return { state, fire: allowed };
}

const fmtDate = (d: Date) => d.toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "short", timeStyle: "short" });

export function alertText(kind: AlertKind, s: DeviceStatus, brand: string, cfg: AlertConfig): string {
  const label = s.plate ? `${s.name} (${s.plate})` : s.name;
  if (kind === "low_battery") return `Aviso de ${brand}: el equipo GPS de ${label} tiene la batería baja (${s.battery} %). Revisa que esté conectado a la corriente del vehículo.`;
  if (kind === "power_cut") return `Aviso de ${brand}: el equipo GPS de ${label} se desconectó de la corriente del vehículo. Puede ser una manipulación o un robo: revisa el vehículo.`;
  return `Aviso de ${brand}: el equipo GPS de ${label} lleva más de ${cfg.offlineHours} horas sin reportar. Último reporte: ${s.lastReport ? fmtDate(s.lastReport) : "nunca"}`;
}

export async function runDeviceAlerts(now = new Date()): Promise<{ checked: number; fired: number; sent: number }> {
  const setting = await alertSetting();
  const summary = { checked: 0, fired: 0, sent: 0 };
  if (!setting.enabled) return summary;
  const cfg = { lowBattery: setting.lowBattery, offlineHours: setting.offlineHours };
  const statuses = (await deviceStatuses(null)).filter((s) => s.lastReport);
  const saved = new Map((await prisma.deviceAlertState.findMany()).map((r) => [r.deviceId, r.state]));
  const fired: { s: DeviceStatus; kind: AlertKind }[] = [];
  for (const s of statuses) {
    summary.checked++;
    const raw = saved.get(s.deviceId);
    let prev: AlertState | null = null;
    try {
      prev = raw ? (JSON.parse(raw) as AlertState) : null;
    } catch {}
    const { state, fire } = nextAlertState(prev, s, now, cfg);
    const json = JSON.stringify(state);
    if (json !== raw) await prisma.deviceAlertState.upsert({ where: { deviceId: s.deviceId }, create: { deviceId: s.deviceId, state: json }, update: { state: json } });
    for (const kind of fire) fired.push({ s, kind });
  }
  if (!fired.length) return summary;

  const ids = [...new Set(fired.map((f) => f.s.deviceId))];
  const users = await deviceUsers(ids);
  const billed = await prisma.billedDevice.findMany({ where: { deviceId: { in: ids }, removedAt: null }, include: { company: true } });
  const rules = await notificationRules();

  for (const { s, kind } of fired) {
    summary.fired++;
    const company = billed.find((b) => b.deviceId === s.deviceId)?.company ?? null;
    const active = company && company.status !== "CANCELED" ? company : null;
    const msg = { subject: `${ALERT_LABEL[kind]}: ${s.name}`, title: ALERT_LABEL[kind], lines: [alertText(kind, s, active?.name ?? "GPS Link", cfg)] };
    const done = new Set<string>();
    // Admin accounts (group 1) see every device; the notice is for the vehicle owner and the brand.
    const owners = users.filter((u) => u.deviceId === s.deviceId && u.groupId !== 1);
    for (const o of owners.length ? owners : [{ userId: null, email: null }]) {
      const res = await notify(kind, { gpswoxUserId: o.userId, email: o.email, companyId: active?.id ?? null }, msg, { rules, done });
      summary.sent += res.filter((r) => r.ok).length;
    }
    await prisma.deviceAlert.create({ data: { deviceId: s.deviceId, deviceName: s.name, companyId: active?.id ?? null, kind, sentTo: done.size } });
  }
  return summary;
}
