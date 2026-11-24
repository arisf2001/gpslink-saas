import type { RowDataPacket } from "mysql2/promise";
import { prisma } from "../db";
import { withGpswoxDb } from "../gpswox";

// Who the admin assistant works for: the platform owner (every account) or one white label (only its own clients).
export type Scope = { kind: "owner" } | { kind: "company"; companyId: string; gpswoxUserId: number | null };
type Tool = (args: Record<string, unknown>) => Promise<unknown>;

// Account changes run only after the admin confirmed that exact action (client data the model reads cannot trigger them).
// The change runs only on the admin's next turn, when his own message is a "sí" to that same pending action.
const adminPending = new Map<number, { key: string; until: number; payload?: unknown }>();
// Only a plain yes ("sí", "sí, hazlo", "ok"); anything with more words ("sí, pero no lo suspendas") is not an approval.
export const YES_RE = /^\s*(s[ií]|confirmo|confirmado|dale|ok|okay|yes|hazlo|procede)(?:[\s,.!]+(s[ií]|hazlo|dale|procede|confirmo|confirmar))?[\s.!]*$/iu;
export function ownerApproved(userId: number, key: string, ownerMessage: string): boolean {
  return approvedPayload(userId, key, ownerMessage, true) !== null;
}
// Like ownerApproved, but the change keeps the values the admin saw when he was asked (payload), even if the model repeats the call differently.
export function approvedPayload<T>(userId: number, key: string, ownerMessage: string, payload: T): T | null {
  const p = adminPending.get(userId);
  if (p && p.key === key && p.until > Date.now() && YES_RE.test(ownerMessage)) {
    adminPending.delete(userId);
    return (p.payload ?? payload) as T;
  }
  adminPending.set(userId, { key, until: Date.now() + 5 * 60_000, payload });
  return null;
}
export const needsConfirmation = (action: string) => ({ status: "needs_owner_confirmation", action, instruction: "Ask the admin to confirm this exact action by replying \"sí\"; when he says sí, call the tool again with the same values." });

// Accounts a scope may see and change; null = the whole platform.
export async function scopeUsers(scope: Scope): Promise<number[] | null> {
  if (scope.kind === "owner") return null;
  const rows = await prisma.endClient.findMany({ where: { companyId: scope.companyId, goneAt: null }, select: { gpswoxUserId: true } });
  return [...new Set([...(scope.gpswoxUserId ? [scope.gpswoxUserId] : []), ...rows.map((r) => r.gpswoxUserId)])];
}

export const inList = (col: string, ids: number[] | null) => (ids ? (ids.length ? `${col} IN (${ids.map((n) => Math.trunc(Number(n)) || 0).join(",")})` : "FALSE") : "TRUE");
const devicesOf = (ids: number[] | null) => (ids ? `AND d.id IN (SELECT device_id FROM user_device_pivot WHERE ${inList("user_id", ids)})` : "");

// The client account a device belongs to (a client before a dealer or an admin), within the scope.
export async function scopedAccount(deviceId: number, users: number[] | null): Promise<number | null> {
  return withGpswoxDb(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT p.user_id FROM user_device_pivot p JOIN users u ON u.id = p.user_id WHERE p.device_id = ? AND ${inList("p.user_id", users)} ORDER BY u.group_id = 2 DESC, u.group_id DESC, p.user_id LIMIT 1`,
      [deviceId],
    );
    return rows[0] ? Number(rows[0].user_id) : null;
  }).catch(() => null);
}

const ourHook = (input: unknown) => typeof input === "string" && input.includes("/api/gpswox/alert?");
async function alertHook(userId: number): Promise<string> {
  const { alertKey } = await import("../wa");
  const { appUrl } = await import("../config");
  return `${appUrl()}/api/gpswox/alert?u=${userId}&k=${alertKey(userId)}`;
}

// Admin tools: the owner sees and changes every account; a white label only its own clients.
export function manageTools(scope: Scope, users: number[] | null, actorId: number, message: string): Record<string, Tool> {
  const day = (col: string) => `IF(${col} > '2000-01-01', DATE_FORMAT(${col}, '%Y-%m-%d'), NULL)`;
  const fullName = "TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, '')))";
  const owner = scope.kind === "owner";
  const inScope = (id: number) => !users || users.includes(Number(id));
  const notYours = { error: "That account or vehicle is not among your clients" };
  return {
    find_clients: async ({ query }) => {
      const q = String(query ?? "").trim();
      if (q.length < 3) return { error: "Ask for at least 3 letters or digits of the email, phone or name" };
      const digits = q.replace(/\D/g, "");
      return withGpswoxDb(async (conn) => {
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT u.id, u.email, u.phone_number AS phone, u.active, ${day("u.subscription_expiration")} AS account_expires, ${fullName} AS name,
                  (SELECT COUNT(*) FROM user_device_pivot p WHERE p.user_id = u.id) AS devices
             FROM users u LEFT JOIN clients c ON c.id = u.client_id
            WHERE (u.email LIKE ? OR ${fullName} LIKE ? ${digits.length >= 7 ? "OR REGEXP_REPLACE(u.phone_number, '[^0-9]', '') LIKE ?" : ""}) AND ${inList("u.id", users)}
            ORDER BY u.id LIMIT 10`,
          [`%${q}%`, `%${q}%`, ...(digits.length >= 7 ? [`%${digits.slice(-7)}%`] : [])],
        );
        return { clients: rows.map((r) => ({ user_id: r.id, email: r.email, phone: r.phone || null, name: r.name || null, active: !!r.active, account_expires: r.account_expires, devices: Number(r.devices) })) };
      });
    },
    client_vehicles: async ({ user_id }) => {
      if (!inScope(Number(user_id))) return notYours;
      return withGpswoxDb(async (conn) => {
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT d.id, d.name, d.plate_number AS plate, ${day("d.expiration_date")} AS membership_expires, DATE_FORMAT(t.server_time, '%Y-%m-%dT%H:%i:%sZ') AS reported
             FROM user_device_pivot p JOIN devices d ON d.id = p.device_id AND d.deleted = 0 LEFT JOIN traccar_devices t ON t.id = d.traccar_device_id
            WHERE p.user_id = ? ORDER BY d.name LIMIT 60`,
          [Number(user_id)],
        );
        return { vehicles: rows.map((r) => ({ device_id: r.id, name: r.name, plate: r.plate || null, membership_expires: r.membership_expires, minutes_since_last_report: r.reported ? Math.round((Date.now() - new Date(String(r.reported)).getTime()) / 60_000) : "never" })) };
      });
    },
    set_client_active: async ({ email, active }) => {
      const mail = String(email ?? "").trim().toLowerCase();
      const { setUserActive, userIdByEmail } = await import("../gpswox");
      const id = mail ? await userIdByEmail(mail).catch(() => null) : null;
      if (!id) return { error: "No client account with that email" };
      if (!inScope(id)) return notYours;
      // A white-label client is blocked/unblocked like the company panel does, so the panel shows "Desbloquear".
      const client = await prisma.endClient.findFirst({ where: { email: mail, goneAt: null, ...(scope.kind === "company" ? { companyId: scope.companyId } : {}) }, include: { company: true } });
      if (!client && !owner) return { error: "Only the platform owner can change that account" };
      const action = `${active === true ? "Activate" : "Suspend"} the account ${mail}`;
      if (!ownerApproved(actorId, action, message)) return needsConfirmation(action);
      if (client) {
        const { blockClient, unblockClient } = await import("../clients");
        if (active !== true) await blockClient(client.company, client, "manual");
        else if (!(await unblockClient(client))) return { error: "The client is past its paid-until date: register a payment or a new date in the company panel first" };
      } else await setUserActive(mail, active === true);
      return { status: active === true ? "activated" : "suspended", email: mail };
    },
    extend_membership: async ({ device_id, months }) => {
      if (!owner) return { error: "Only the platform owner can extend a device membership; register the client's payment in Mis clientes instead" };
      const n = Number(months);
      if (!Number.isInteger(n) || n < 1 || n > 36) return { error: "Months must be between 1 and 36" };
      const action = `Extend the membership of device ${Number(device_id)} by ${n} months`;
      if (!ownerApproved(actorId, action, message)) return needsConfirmation(action);
      const current = await withGpswoxDb(async (conn) => {
        const [rows] = await conn.query<RowDataPacket[]>("SELECT name, IF(expiration_date > '2000-01-01', DATE_FORMAT(expiration_date, '%Y-%m-%dT%H:%i:%sZ'), NULL) AS exp FROM devices WHERE id = ? AND deleted = 0", [Number(device_id)]);
        return rows[0] ?? null;
      });
      if (!current) return { error: "Device not found" };
      const base = current.exp && new Date(String(current.exp)) > new Date() ? new Date(String(current.exp)) : new Date();
      const dayOfMonth = base.getUTCDate();
      base.setUTCDate(1);
      base.setUTCMonth(base.getUTCMonth() + n);
      base.setUTCDate(Math.min(dayOfMonth, new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate()));
      const { setDeviceExpiration } = await import("../gpswox");
      await setDeviceExpiration(Number(device_id), base);
      return { status: "extended", device: current.name, membership_expires: base.toISOString().slice(0, 10) };
    },
    list_alerts: async ({ device_id }) => {
      const id = Number(device_id);
      if (users && !(await scopedAccount(id, users))) return notYours;
      return withGpswoxDb(async (conn) => {
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT a.id, a.name, a.type, a.active, a.notifications, u.email FROM alerts a JOIN users u ON u.id = a.user_id
            WHERE (a.id IN (SELECT alert_id FROM alert_device WHERE device_id = ?) OR (a.for_all_user_devices = 1 AND a.user_id IN (SELECT user_id FROM user_device_pivot WHERE device_id = ?)))
              AND ${inList("a.user_id", users)} ORDER BY a.id LIMIT 40`,
          [id, id],
        );
        return {
          alerts: rows.map((r) => {
            const hook = (JSON.parse(String(r.notifications || "{}")) as { webhook?: { active?: string; input?: string } }).webhook;
            return { alert_id: r.id, name: r.name, type: r.type, active: !!r.active, sends_to_whatsapp: hook?.active === "1" && ourHook(hook.input), account: r.email };
          }),
        };
      });
    },
    update_alert: async ({ alert_id, ...args }) => {
      let { active, whatsapp } = args;
      const row = await withGpswoxDb(async (conn) => {
        const [rows] = await conn.query<RowDataPacket[]>(`SELECT id, user_id, name, active, notifications FROM alerts WHERE id = ? AND ${inList("user_id", users)}`, [Number(alert_id)]);
        return rows[0] ?? null;
      });
      if (!row) return { error: "Alert not found among your clients' alerts" };
      const notes = JSON.parse(String(row.notifications || "{}")) as Record<string, { active?: string; input?: string }>;
      const asked = { active: typeof active === "boolean" ? active : null, whatsapp: typeof whatsapp === "boolean" ? whatsapp : null };
      if (asked.active === null && asked.whatsapp === null) return { error: "Say what to change: turn it on/off or send it to WhatsApp" };
      if (asked.whatsapp && notes.webhook?.active === "1" && notes.webhook.input && !ourHook(notes.webhook.input)) return { error: "This alert already sends to another service; create a new alert with create_alert instead of changing it" };
      const describe = (c: typeof asked) => [c.active === null ? "" : c.active ? "turn it on" : "turn it off", c.whatsapp === null ? "" : c.whatsapp ? "send it to the client's WhatsApp" : "stop sending it to WhatsApp"].filter(Boolean).join(" and ");
      const ok = approvedPayload(actorId, `alert:${row.id}`, message, asked);
      if (!ok) return needsConfirmation(`Alert ${row.id} "${row.name}": ${describe(asked)}`);
      const changes = describe(ok);
      active = ok.active ?? undefined;
      whatsapp = ok.whatsapp ?? undefined;
      if (whatsapp === true) notes.webhook = { active: "1", input: await alertHook(Number(row.user_id)) };
      if (whatsapp === false && ourHook(notes.webhook?.input)) notes.webhook = { active: "0" };
      await withGpswoxDb((conn) => conn.query("UPDATE alerts SET active = ?, notifications = ? WHERE id = ?", [typeof active === "boolean" ? Number(active) : Number(row.active), JSON.stringify(notes), row.id]));
      return { status: "updated", alert: row.name, changes };
    },
    system_summary: async () => {
      const [dev, acc] = await withGpswoxDb(async (conn) => {
        const [d] = await conn.query<RowDataPacket[]>(
          `SELECT COUNT(*) AS total, SUM(t.server_time > UTC_TIMESTAMP() - INTERVAL 10 MINUTE) AS online, SUM(t.server_time IS NULL OR t.server_time < UTC_TIMESTAMP() - INTERVAL 1 DAY) AS silent_over_1_day,
                  SUM(d.expiration_date > '2000-01-01' AND d.expiration_date < NOW()) AS membership_expired, SUM(d.expiration_date >= NOW() AND d.expiration_date < NOW() + INTERVAL 7 DAY) AS membership_expiring_7_days
             FROM devices d LEFT JOIN traccar_devices t ON t.id = d.traccar_device_id WHERE d.deleted = 0 ${devicesOf(users)}`,
        );
        const [a] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS total, SUM(active = 1) AS active FROM users WHERE group_id <> 1 AND ${inList("id", users)}`);
        return [d[0], a[0]];
      });
      const num = (o: RowDataPacket) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v ?? 0)]));
      const now = new Date();
      const week = new Date(now.getTime() + 7 * 864e5);
      if (scope.kind === "company") {
        const [blocked, due] = await Promise.all([
          prisma.endClient.count({ where: { companyId: scope.companyId, goneAt: null, blockReason: { not: null } } }),
          prisma.endClient.count({ where: { companyId: scope.companyId, goneAt: null, paidUntil: { gte: now, lt: week } } }),
        ]);
        return { devices: num(dev), client_accounts: { ...num(acc), blocked, paid_until_within_7_days: due } };
      }
      const [companies, simExpired, simExpiring, open] = await Promise.all([
        prisma.company.groupBy({ by: ["status"], _count: { _all: true } }),
        prisma.simCard.count({ where: { goneAt: null, expiresAt: { lt: now } } }),
        prisma.simCard.count({ where: { goneAt: null, expiresAt: { gte: now, lt: week } } }),
        prisma.manualInvoice.groupBy({ by: ["currency"], where: { status: "OPEN" }, _count: { _all: true }, _sum: { totalCents: true } }),
      ]);
      return {
        devices: num(dev), client_accounts: num(acc),
        white_labels: Object.fromEntries(companies.map((c) => [c.status.toLowerCase(), c._count._all])),
        sim_cards: { expired: simExpired, expiring_7_days: simExpiring },
        unpaid_invoices: open.map((o) => ({ currency: o.currency.toUpperCase(), count: o._count._all, total: (o._sum.totalCents ?? 0) / 100 })),
      };
    },
    vehicles_report: async ({ filter, hours, days }) => {
      const f = filter === "expired" || filter === "expiring" ? filter : "offline";
      const h = Math.min(Math.max(Number(hours) || 24, 1), 24 * 90);
      const dd = Math.min(Math.max(Number(days) || 7, 1), 90);
      const cond = f === "offline" ? "(t.server_time IS NULL OR t.server_time < UTC_TIMESTAMP() - INTERVAL ? HOUR)" : f === "expired" ? "d.expiration_date > '2000-01-01' AND d.expiration_date < NOW()" : "d.expiration_date >= NOW() AND d.expiration_date < NOW() + INTERVAL ? DAY";
      const args = f === "offline" ? [h] : f === "expired" ? [] : [dd];
      return withGpswoxDb(async (conn) => {
        const from = `FROM devices d LEFT JOIN traccar_devices t ON t.id = d.traccar_device_id WHERE d.deleted = 0 AND ${cond} ${devicesOf(users)}`;
        const [[count]] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS n ${from}`, args);
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT d.id, d.name, ${day("d.expiration_date")} AS membership_expires, DATE_FORMAT(t.server_time, '%Y-%m-%dT%H:%i:%sZ') AS reported,
                  (SELECT u.email FROM user_device_pivot p JOIN users u ON u.id = p.user_id WHERE p.device_id = d.id AND ${inList("p.user_id", users)} ORDER BY u.group_id = 2 DESC, u.group_id DESC LIMIT 1) AS account
             ${from} ORDER BY ${f === "offline" ? "t.server_time" : "d.expiration_date"} LIMIT 40`,
          args,
        );
        return {
          filter: f, total: Number(count.n),
          vehicles: rows.map((r) => ({ device_id: r.id, name: r.name, account: r.account, membership_expires: r.membership_expires, minutes_since_last_report: r.reported ? Math.round((Date.now() - new Date(String(r.reported)).getTime()) / 60_000) : "never" })),
        };
      });
    },
  };
}
