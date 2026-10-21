import { trackerUrl } from "../config";

// Calls the GPSWOX user API with the customer's own user_api_hash, so GPS Link itself
// decides which vehicles the customer can see and command.

export class SessionError extends Error {}

export type Vehicle = {
  id: number;
  name: string;
  plate: string | null;
  online: string;
  lat: number;
  lng: number;
  speed: number;
  speedUnit: string;
  engine: boolean | null;
  time: string;
  timestamp: number;
  address: string | null;
  stopDuration: string | null;
};

export type HistorySummary = {
  distance: string;
  topSpeed: string;
  moving: string;
  stopped: string;
  stops: { from: string; to: string; duration: string; lat: number; lng: number; address: string | null }[];
  points: number;
};

export type UserInfo = { email: string; groupId: number };

const isMock = () => process.env.GPSWOX_MODE === "mock";

async function userCall(hash: string, path: string, params: Record<string, string> = {}, method: "GET" | "POST" = "GET"): Promise<unknown> {
  const qs = new URLSearchParams({ lang: "es", ...params });
  const url = `${trackerUrl()}/api/${path}`;
  const res = await fetch(method === "GET" ? `${url}?${qs}&user_api_hash=${encodeURIComponent(hash)}` : `${url}?user_api_hash=${encodeURIComponent(hash)}`, {
    method,
    headers: { Accept: "application/json", ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: method === "POST" ? qs : undefined,
    signal: AbortSignal.timeout(25_000),
  });
  if (res.status === 401 || res.status === 403) throw new SessionError();
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`GPS Link ${path} respondió ${res.status}`);
  return data;
}

// --- mock data for local tests (GPSWOX_MODE=mock): hashes look like "mock:<email>" ---
const MOCK_VEHICLES: Vehicle[] = [
  { id: 9001, name: "Aveo", plate: "A123456", online: "online", lat: 18.4712, lng: -69.9318, speed: 42, speedUnit: "kph", engine: true, time: "", timestamp: 0, address: "Av. 27 de Febrero, Santo Domingo", stopDuration: null },
  { id: 9002, name: "Camión Isuzu", plate: "L987654", online: "offline", lat: 18.4861, lng: -69.8932, speed: 0, speedUnit: "kph", engine: false, time: "", timestamp: 0, address: "Av. Venezuela, Santo Domingo Este", stopDuration: "3h 12min" },
];
export const mockCommands: { deviceId: number; type: string }[] = [];

function mockEmail(hash: string): string {
  if (!hash.startsWith("mock:")) throw new SessionError();
  return hash.slice(5).toLowerCase();
}

export async function login(email: string, password: string): Promise<string | null> {
  if (isMock()) return password === "mockpass" ? `mock:${email.toLowerCase()}` : null;
  const res = await fetch(`${trackerUrl()}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { user_api_hash?: string };
  return res.ok && data.user_api_hash ? data.user_api_hash : null;
}

export async function userInfo(hash: string): Promise<UserInfo> {
  if (isMock()) return { email: mockEmail(hash), groupId: 2 };
  const data = (await userCall(hash, "get_user_data")) as { email?: string; group_id?: number } | null;
  if (!data?.email) throw new SessionError();
  return { email: String(data.email).toLowerCase(), groupId: Number(data.group_id ?? 2) };
}

type RawItem = {
  id: number; name: string; online: string; lat: number; lng: number; speed: number; distance_unit_hour?: string;
  engine_status?: boolean | null; time: string; timestamp: number; address?: string; stop_duration?: string;
  device_data?: { plate_number?: string | null; registration_number?: string | null };
};

export async function vehicles(hash: string): Promise<Vehicle[]> {
  if (isMock()) {
    mockEmail(hash);
    const now = Math.floor(Date.now() / 1000);
    return MOCK_VEHICLES.map((v) => ({ ...v, timestamp: now - 120, time: new Date((now - 120) * 1000).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" }) }));
  }
  const groups = (await userCall(hash, "get_devices")) as { items?: RawItem[] }[] | null;
  const items = (groups ?? []).flatMap((g) => g.items ?? []);
  return items.map((i) => ({
    id: Number(i.id),
    name: String(i.name ?? `#${i.id}`),
    plate: i.device_data?.plate_number || i.device_data?.registration_number || null,
    online: String(i.online ?? "offline"),
    lat: Number(i.lat),
    lng: Number(i.lng),
    speed: Number(i.speed ?? 0),
    speedUnit: i.distance_unit_hour ?? "kph",
    engine: typeof i.engine_status === "boolean" ? i.engine_status : null,
    time: String(i.time ?? ""),
    timestamp: Number(i.timestamp ?? 0),
    address: i.address && i.address !== "-" ? String(i.address) : null,
    stopDuration: i.stop_duration && i.stop_duration !== "0s" ? String(i.stop_duration) : null,
  }));
}

function splitLocal(iso: string): [string, string] {
  const [date, time = "00:00"] = iso.replace(" ", "T").split("T");
  return [date, time.slice(0, 5)];
}

type RawHistoryItem = { status?: number; show?: string; left?: string; time?: string; raw_time?: string; lat?: number; lng?: number; address?: string; items?: unknown[] };

export async function history(hash: string, deviceId: number, from: string, to: string): Promise<HistorySummary> {
  if (isMock()) {
    mockEmail(hash);
    return { distance: "38.4 Km", topSpeed: "86 kph", moving: "1h 20min", stopped: "5h 02min", points: 412, stops: [{ from: `${from.slice(0, 10)} 09:10`, to: `${from.slice(0, 10)} 12:40`, duration: "3h 30min", lat: 18.4861, lng: -69.8932, address: "Av. Venezuela, Santo Domingo Este" }] };
  }
  const [fromDate, fromTime] = splitLocal(from);
  const [toDate, toTime] = splitLocal(to);
  const data = (await userCall(hash, "get_history", { device_id: String(deviceId), from_date: fromDate, from_time: fromTime, to_date: toDate, to_time: toTime })) as {
    distance_sum?: string; top_speed?: string; move_duration?: string; stop_duration?: string; items?: RawHistoryItem[];
  } | null;
  const items = data?.items ?? [];
  const stops = items
    .filter((i) => i.status === 2)
    .slice(0, 15)
    .map((i) => ({ from: String(i.show ?? i.raw_time ?? ""), to: String(i.left ?? ""), duration: String(i.time ?? ""), lat: Number(i.lat ?? 0), lng: Number(i.lng ?? 0), address: i.address ? String(i.address) : null }));
  return {
    distance: data?.distance_sum ?? "0 Km",
    topSpeed: data?.top_speed ?? "0",
    moving: data?.move_duration ?? "0s",
    stopped: data?.stop_duration ?? "0s",
    stops,
    points: items.reduce((n, i) => n + (Array.isArray(i.items) ? i.items.length : 0), 0),
  };
}

export type EngineCommand = "engine_stop" | "engine_resume";
const GPSWOX_COMMAND: Record<EngineCommand, string> = { engine_stop: "engineStop", engine_resume: "engineResume" };

export async function supportsCommand(hash: string, deviceId: number, command: EngineCommand): Promise<boolean> {
  if (isMock()) return MOCK_VEHICLES.some((v) => v.id === deviceId);
  const list = (await userCall(hash, "get_device_commands", { device_id: String(deviceId) })) as { type?: string }[] | null;
  return Array.isArray(list) && list.some((c) => c.type === GPSWOX_COMMAND[command]);
}

export async function sendCommand(hash: string, deviceId: number, command: EngineCommand): Promise<{ ok: boolean; error?: string }> {
  if (isMock()) {
    mockCommands.push({ deviceId, type: GPSWOX_COMMAND[command] });
    return { ok: true };
  }
  const data = (await userCall(hash, "send_gprs_command", { device_id: String(deviceId), type: GPSWOX_COMMAND[command] }, "POST")) as { status?: number; error?: string; message?: string } | null;
  if (data?.status === 1) return { ok: true };
  return { ok: false, error: String(data?.error ?? data?.message ?? "sin respuesta") };
}

export function streetViewUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
}

export function mapUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
