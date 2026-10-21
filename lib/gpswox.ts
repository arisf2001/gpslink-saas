import mysql, { type RowDataPacket } from "mysql2/promise";
import { trackerUrl } from "./config";
import { prisma } from "./db";

// Talks to the GPSWOX admin API on track.gpslinkusa.com with an admin account's user_api_hash.
// GPSWOX_MODE=mock keeps everything local (dev/tests) without touching the real platform.

export type ResellerInput = {
  email: string;
  password: string;
  devicesLimit: number;
  expiresAt: Date;
  phone?: string;
};

let cachedHash: string | null = null;

function isMock() {
  return process.env.GPSWOX_MODE === "mock";
}

function gpswoxDate(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function availableMaps(): number[] {
  return (process.env.GPSWOX_MAPS ?? "2,51,53,54,55,56").split(",").map((v) => Number(v.trim())).filter(Boolean);
}

async function apiHash(forceRefresh = false): Promise<string> {
  if (process.env.GPSWOX_API_HASH) return process.env.GPSWOX_API_HASH;
  if (cachedHash && !forceRefresh) return cachedHash;
  const email = process.env.GPSWOX_ADMIN_EMAIL;
  const password = process.env.GPSWOX_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Faltan GPSWOX_ADMIN_EMAIL / GPSWOX_ADMIN_PASSWORD");
  const res = await fetch(`${trackerUrl()}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.user_api_hash) throw new Error(`GPSWOX login falló (${res.status})`);
  cachedHash = data.user_api_hash as string;
  return cachedHash;
}

async function call(method: "POST" | "PUT", path: string, body: Record<string, unknown>, retried = false): Promise<Record<string, unknown>> {
  const hash = await apiHash(retried);
  const res = await fetch(`${trackerUrl()}/api/admin/${path}?lang=es`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json", "user-api-hash": hash },
    body: JSON.stringify(body),
  });
  if (res.status === 401 && !retried && !process.env.GPSWOX_API_HASH) return call(method, path, body, true);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.status !== 1) {
    const errors = data.errors ? JSON.stringify(data.errors) : String(data.message ?? res.statusText);
    throw new Error(`GPSWOX ${path} respondió ${res.status}: ${errors}`);
  }
  return data;
}

let mockSeq = Math.floor(Date.now() / 1000);

export async function createReseller(input: ResellerInput): Promise<number> {
  if (isMock()) return ++mockSeq;
  const data = await call("POST", "client", {
    active: 1,
    email: input.email,
    password: input.password,
    password_confirmation: input.password,
    group_id: 3,
    role_id: 3,
    available_maps: availableMaps(),
    enable_devices_limit: 1,
    devices_limit: input.devicesLimit,
    enable_expiration_date: 1,
    expiration_date: gpswoxDate(input.expiresAt),
    phone_number: input.phone,
  });
  const id = Number((data.item as { id?: number } | undefined)?.id);
  if (!id) throw new Error("GPSWOX no devolvió el id del revendedor");
  return id;
}

export async function setResellerActive(email: string, active: boolean): Promise<void> {
  if (isMock()) return;
  await call("POST", "client/status", { email, status: active ? 1 : 0 });
}

export async function updateReseller(id: number, email: string, changes: { devicesLimit: number; expiresAt: Date; active: boolean }): Promise<void> {
  if (isMock()) return;
  await call("PUT", "client", {
    id,
    email,
    active: changes.active ? 1 : 0,
    group_id: 3,
    role_id: 3,
    available_maps: availableMaps(),
    enable_devices_limit: 1,
    devices_limit: changes.devicesLimit,
    enable_expiration_date: 1,
    expiration_date: gpswoxDate(changes.expiresAt),
  });
}

export function resellerLoginUrl(): string {
  return `${trackerUrl()}/login`;
}

export type GpswoxDevice = { id: number; createdAt: Date };

// Devices of the reseller and of its clients, oldest first. Read-only access to the GPSWOX database.
export async function deviceList(userId: number): Promise<GpswoxDevice[]> {
  if (isMock()) {
    const devices = await prisma.mockDevice.findMany({ where: { gpswoxUserId: userId }, orderBy: { createdAt: "asc" } });
    return devices.map((d) => ({ id: d.id, createdAt: d.createdAt }));
  }
  const url = process.env.GPSWOX_DB_URL;
  if (!url) throw new Error("GPSWOX_DB_URL no configurado");
  const conn = await mysql.createConnection(url);
  try {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT d.id AS id, d.created_at AS created_at
         FROM devices d
         JOIN user_device_pivot p ON p.device_id = d.id
         JOIN users u ON u.id = p.user_id
        WHERE u.id = ? OR u.manager_id = ?
        GROUP BY d.id, d.created_at
        ORDER BY d.created_at`,
      [userId, userId],
    );
    return rows.map((r) => ({ id: Number(r.id), createdAt: new Date(r.created_at) }));
  } finally {
    await conn.end();
  }
}

export async function setDeviceExpiration(deviceId: number, expiresAt: Date): Promise<void> {
  if (isMock()) return;
  await call("POST", `device/${deviceId}/expiration`, { expiration_date: gpswoxDate(expiresAt) });
}
