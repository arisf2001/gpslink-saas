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
  managerId?: number;
};

let cachedHash: string | null = null;

export function isMock() {
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

// Sends a GPRS command (e.g. engineStop) with the admin account.
export async function adminCommand(deviceId: number, type: string, data?: string): Promise<{ ok: boolean; error?: string }> {
  if (isMock()) {
    mockAdminCommands.push({ deviceId, type: data ?? type });
    return { ok: true };
  }
  const res = await fetch(`${trackerUrl()}/api/send_gprs_command?lang=es&user_api_hash=${encodeURIComponent(await apiHash())}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ device_id: String(deviceId), type, ...(data ? { data, message: data } : {}) }),
  });
  const json = (await res.json().catch(() => ({}))) as { status?: number; error?: string; message?: string };
  return json.status === 1 ? { ok: true } : { ok: false, error: String(json.error ?? json.message ?? res.statusText).slice(0, 200) };
}
export const mockAdminCommands: { deviceId: number; type: string }[] = [];

async function call(method: "GET" | "POST" | "PUT", path: string, body: Record<string, unknown>, retried = false): Promise<Record<string, unknown>> {
  const hash = await apiHash(retried);
  const query = method === "GET" ? `&${new URLSearchParams(body as Record<string, string>)}` : "";
  const res = await fetch(`${trackerUrl()}/api/admin/${path}?lang=es${query}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json", "user-api-hash": hash },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && !retried && !process.env.GPSWOX_API_HASH) return call(method, path, body, true);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (method === "GET" && res.ok) return data;
  if (!res.ok || data.status !== 1) {
    const errors = data.errors ? JSON.stringify(data.errors) : String(data.message ?? res.statusText);
    throw new Error(`GPSWOX ${path} respondió ${res.status}: ${errors}`);
  }
  return data;
}

let mockSeq = Math.floor(Date.now() / 1000);

export async function createReseller(input: ResellerInput): Promise<number> {
  if (isMock()) {
    if (!input.managerId) return ++mockSeq;
    return (await prisma.mockClient.create({ data: { managerId: input.managerId, email: input.email, phone: input.phone ?? null, groupId: 3 } })).id;
  }
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
    ...(input.managerId ? { enable_manager_id: 1, manager_id: input.managerId } : {}),
  });
  const id = Number((data.item as { id?: number } | undefined)?.id);
  if (!id) throw new Error("GPSWOX no devolvió el id del revendedor");
  return id;
}

// Activates or deactivates any GPSWOX user (a reseller or one of its clients).
export async function setUserActive(email: string, active: boolean): Promise<void> {
  if (isMock()) {
    await prisma.mockClient.updateMany({ where: { email }, data: { active } });
    return;
  }
  await call("POST", "client/status", { email, status: active ? 1 : 0 });
}

export const setResellerActive = setUserActive;

export async function updateReseller(
  id: number,
  email: string,
  changes: { devicesLimit: number; expiresAt: Date; active: boolean; password?: string; phone?: string },
): Promise<void> {
  if (isMock()) return;
  await call("PUT", "client", {
    id,
    email,
    ...(changes.password ? { password: changes.password, password_confirmation: changes.password } : {}),
    ...(changes.phone !== undefined ? { phone_number: changes.phone } : {}),
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

type TreeNode = { id: number; managerId: number | null };

export async function withGpswoxDb<T>(fn: (conn: mysql.Connection) => Promise<T>): Promise<T> {
  const url = process.env.GPSWOX_DB_URL;
  if (!url) throw new Error("GPSWOX_DB_URL no configurado");
  const conn = await mysql.createConnection(url);
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

// Every user below a reseller: its clients, its dealers and the dealers' clients.
async function subtree(rootId: number): Promise<TreeNode[]> {
  if (isMock()) {
    const all = await prisma.mockClient.findMany();
    const out: TreeNode[] = [];
    const walk = (parent: number, depth: number) => {
      if (depth > 10) return;
      for (const c of all.filter((m) => m.managerId === parent)) {
        out.push({ id: c.id, managerId: c.managerId });
        walk(c.id, depth + 1);
      }
    };
    walk(rootId, 0);
    return out;
  }
  return withGpswoxDb(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `WITH RECURSIVE t AS (
         SELECT id, manager_id, 1 AS lvl FROM users WHERE manager_id = ?
         UNION ALL
         SELECT u.id, u.manager_id, t.lvl + 1 FROM users u JOIN t ON u.manager_id = t.id WHERE t.lvl < 10
       ) SELECT DISTINCT id, manager_id FROM t`,
      [rootId],
    );
    return rows.map((r) => ({ id: Number(r.id), managerId: r.manager_id === null ? null : Number(r.manager_id) }));
  });
}

async function deviceLinks(userIds: number[]): Promise<{ userId: number; deviceId: number; createdAt: Date }[]> {
  if (!userIds.length) return [];
  if (isMock()) {
    const devices = await prisma.mockDevice.findMany({ where: { gpswoxUserId: { in: userIds } } });
    return devices.map((d) => ({ userId: d.gpswoxUserId, deviceId: d.id, createdAt: d.createdAt }));
  }
  return withGpswoxDb(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT p.user_id AS user_id, d.id AS id, d.created_at AS created_at
         FROM user_device_pivot p JOIN devices d ON d.id = p.device_id
        WHERE p.user_id IN (?)`,
      [userIds],
    );
    return rows.map((r) => ({ userId: Number(r.user_id), deviceId: Number(r.id), createdAt: new Date(r.created_at) }));
  });
}

// Devices of the reseller, its clients, its dealers and the dealers' clients, oldest first. Read-only access to the GPSWOX database.
export async function deviceList(userId: number): Promise<GpswoxDevice[]> {
  const ids = [userId, ...(await subtree(userId)).map((n) => n.id)];
  const unique = new Map<number, Date>();
  for (const l of await deviceLinks(ids)) unique.set(l.deviceId, l.createdAt);
  return [...unique].map(([id, createdAt]) => ({ id, createdAt })).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export type GpswoxClient = { id: number; managerId: number | null; email: string; phone: string | null; isDealer: boolean; active: boolean; devices: number };

async function contactInfo(ids: Set<number>): Promise<Map<number, { email: string; phone: string | null; groupId: number; active: boolean }>> {
  const out = new Map<number, { email: string; phone: string | null; groupId: number; active: boolean }>();
  if (isMock()) {
    for (const c of await prisma.mockClient.findMany({ where: { id: { in: [...ids] } } })) out.set(c.id, { email: c.email, phone: c.phone, groupId: c.groupId, active: c.active });
    return out;
  }
  const limit = 500;
  for (let page = 1; page <= 100 && out.size < ids.size; page++) {
    const data = await call("GET", "clients", { limit: String(limit), page: String(page) });
    const items = (data.data ?? []) as { id: number; email: string; phone_number: string | null; group_id: number; active: number | boolean }[];
    for (const u of items) if (ids.has(Number(u.id))) out.set(Number(u.id), { email: u.email, phone: u.phone_number || null, groupId: Number(u.group_id), active: !!Number(u.active) });
    if (items.length < limit) break;
  }
  return out;
}

// The clients and dealers below a reseller, each with the devices of its own subtree.
export async function clientsUnder(rootId: number): Promise<GpswoxClient[]> {
  const nodes = await subtree(rootId);
  if (!nodes.length) return [];
  const links = await deviceLinks(nodes.map((n) => n.id));
  const own = new Map<number, Set<number>>();
  for (const l of links) (own.get(l.userId) ?? own.set(l.userId, new Set()).get(l.userId)!).add(l.deviceId);
  const children = new Map<number, number[]>();
  for (const n of nodes) if (n.managerId !== null) (children.get(n.managerId) ?? children.set(n.managerId, []).get(n.managerId)!).push(n.id);
  const devicesOf = (id: number, depth = 0): Set<number> => {
    const set = new Set(own.get(id) ?? []);
    if (depth < 10) for (const c of children.get(id) ?? []) for (const d of devicesOf(c, depth + 1)) set.add(d);
    return set;
  };
  const info = await contactInfo(new Set(nodes.map((n) => n.id)));
  return nodes.flatMap((n) => {
    const i = info.get(n.id);
    if (!i) return [];
    return [{ id: n.id, managerId: n.managerId === rootId ? null : n.managerId, email: i.email, phone: i.phone, isDealer: i.groupId === 3, active: i.active, devices: devicesOf(n.id).size }];
  });
}

export async function setDeviceExpiration(deviceId: number, expiresAt: Date): Promise<void> {
  if (isMock()) return;
  await call("POST", `device/${deviceId}/expiration`, { expiration_date: gpswoxDate(expiresAt) });
}

// The user itself and its managers up to the top, nearest first. Read-only access to the GPSWOX database.
export async function ancestors(userId: number): Promise<number[]> {
  const chain = [userId];
  if (isMock()) {
    let current = await prisma.mockClient.findUnique({ where: { id: userId } });
    while (current && chain.length < 12) {
      chain.push(current.managerId);
      current = await prisma.mockClient.findUnique({ where: { id: current.managerId } });
    }
    return chain;
  }
  return withGpswoxDb(async (conn) => {
    let id: number | null = userId;
    while (id !== null && chain.length < 12) {
      const [rows]: [RowDataPacket[], unknown] = await conn.query<RowDataPacket[]>("SELECT manager_id FROM users WHERE id = ?", [id]);
      const manager: number | null = rows[0]?.manager_id ? Number(rows[0].manager_id) : null;
      if (manager !== null && !chain.includes(manager)) chain.push(manager);
      id = manager !== null && chain.length < 12 ? manager : null;
    }
    return chain;
  });
}

let emailIndex: { at: number; map: Map<string, number> } | null = null;

// GPSWOX user id for an email, from the admin client list (cached for 10 minutes).
export async function userIdByEmail(email: string): Promise<number | null> {
  const key = email.trim().toLowerCase();
  if (isMock()) return (await prisma.mockClient.findFirst({ where: { email: key } }))?.id ?? null;
  if (!emailIndex || Date.now() - emailIndex.at > 10 * 60_000 || !emailIndex.map.has(key)) {
    const map = new Map<string, number>();
    const limit = 500;
    for (let page = 1; page <= 100; page++) {
      const data = await call("GET", "clients", { limit: String(limit), page: String(page) });
      const items = (data.data ?? []) as { id: number; email: string }[];
      for (const u of items) map.set(String(u.email).toLowerCase(), Number(u.id));
      if (items.length < limit) break;
    }
    emailIndex = { at: Date.now(), map };
  }
  return emailIndex.map.get(key) ?? null;
}

// The user and its managers up to the root, nearest first; reseller = GPSWOX group 3 (white label / dealer).
export async function brandChain(userId: number): Promise<{ id: number; reseller: boolean }[]> {
  if (isMock()) {
    const ids = await ancestors(userId);
    const rows = await prisma.mockClient.findMany({ where: { id: { in: ids } }, select: { id: true, groupId: true } });
    return ids.map((id) => ({ id, reseller: rows.some((r) => r.id === id && r.groupId === 3) }));
  }
  return withGpswoxDb(async (conn) => {
    const chain: { id: number; reseller: boolean }[] = [];
    let id: number | null = userId;
    while (id !== null && chain.length < 12) {
      const [rows]: [RowDataPacket[], unknown] = await conn.query<RowDataPacket[]>("SELECT manager_id, group_id FROM users WHERE id = ?", [id]);
      if (!rows[0]) break;
      chain.push({ id, reseller: Number(rows[0].group_id) === 3 });
      const manager: number | null = rows[0].manager_id ? Number(rows[0].manager_id) : null;
      id = manager !== null && !chain.some((c) => c.id === manager) ? manager : null;
    }
    return chain;
  });
}

// Pay-per-device activation: the device is created under the admin account (hidden from the client) until it is paid.
export async function deviceIdByImei(imei: string): Promise<number | null> {
  if (isMock()) return (await prisma.mockDevice.findFirst({ where: { imei } }))?.id ?? null;
  return withGpswoxDb(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT id FROM devices WHERE imei = ? AND deleted = 0 LIMIT 1", [imei]);
    return rows[0] ? Number(rows[0].id) : null;
  });
}

export async function createAdminDevice(imei: string, name: string): Promise<number> {
  if (isMock()) return (await prisma.mockDevice.create({ data: { gpswoxUserId: 0, imei, name } })).id;
  const hash = await apiHash();
  const res = await fetch(`${trackerUrl()}/api/add_device?lang=es&user_api_hash=${encodeURIComponent(hash)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ imei, name }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || Number(data.status) !== 1) throw new Error(`GPSWOX add_device respondió ${res.status}: ${JSON.stringify(data.errors ?? data.message ?? "")}`);
  const id = Number(data.id ?? (data.item as { id?: number } | undefined)?.id) || (await deviceIdByImei(imei));
  if (!id) throw new Error("GPSWOX no devolvió el id del equipo");
  return id;
}

export async function addDeviceUser(deviceId: number, userId: number): Promise<void> {
  if (isMock()) {
    await prisma.mockDevice.update({ where: { id: deviceId }, data: { gpswoxUserId: userId } });
    return;
  }
  await call("POST", `device/${deviceId}/user`, { user_id: userId });
}

// Last time each device reported (traccar server_time), null if it never did.
export async function lastSignals(deviceIds: number[]): Promise<Map<number, Date | null>> {
  const out = new Map<number, Date | null>();
  if (!deviceIds.length) return out;
  if (isMock()) {
    for (const d of await prisma.mockDevice.findMany({ where: { id: { in: deviceIds } } })) out.set(d.id, d.reportedAt);
    return out;
  }
  return withGpswoxDb(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT d.id, t.server_time FROM devices d LEFT JOIN traccar_devices t ON t.id = d.traccar_device_id WHERE d.id IN (?)",
      [deviceIds],
    );
    for (const r of rows) out.set(Number(r.id), r.server_time ? new Date(r.server_time) : null);
    return out;
  });
}

// WhatsApp number saved in the user's GPS Link (GPSWOX) profile.
export async function userPhone(userId: number): Promise<string | null> {
  if (!userId || isMock()) return null;
  return withGpswoxDb(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT phone_number FROM users WHERE id = ?", [userId]);
    return rows[0]?.phone_number ? String(rows[0].phone_number) : null;
  });
}

// GPS Link API key of a user, to open the assistant from the tracking platform without asking the password again.
export async function userApiHash(userId: number): Promise<string | null> {
  if (!userId || isMock()) return null;
  return withGpswoxDb(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT api_hash FROM users WHERE id = ? AND active = 1", [userId]);
    return rows[0]?.api_hash ? String(rows[0].api_hash) : null;
  });
}

