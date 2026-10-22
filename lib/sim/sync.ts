import type { RowDataPacket } from "mysql2/promise";
import { prisma } from "../db";
import { isMock, withGpswoxDb } from "../gpswox";
import { carrierFor, ensureCarriers, statusLabel } from "./carriers";
import { cardExpiry, cardPackage, telebayCards, telebayConfigured, telebayDate, type TelebayCard } from "./telebay";

type DeviceOwner = { deviceId: number; deviceName: string; simNumber: string; userId: number | null; email: string | null; phone: string | null };

// Devices with something in "Número SIM", with their first non-admin owner. Read-only.
export async function devicesWithSim(): Promise<DeviceOwner[]> {
  if (isMock()) return [];
  return withGpswoxDb(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT d.id, d.name, d.sim_number, u.id AS uid, u.email, u.phone_number
         FROM devices d
         LEFT JOIN user_device_pivot p ON p.device_id = d.id
         LEFT JOIN users u ON u.id = p.user_id
        WHERE d.deleted = 0 AND d.sim_number IS NOT NULL AND d.sim_number <> ''
        ORDER BY d.id, (u.group_id = 2) DESC, u.id DESC`,
    );
    const seen = new Map<number, DeviceOwner>();
    for (const r of rows) {
      if (seen.has(Number(r.id))) continue;
      seen.set(Number(r.id), { deviceId: Number(r.id), deviceName: String(r.name ?? ""), simNumber: String(r.sim_number).replace(/\D/g, ""), userId: r.uid ? Number(r.uid) : null, email: r.email ?? null, phone: r.phone_number ?? null });
    }
    return [...seen.values()];
  });
}

export async function deviceOwner(deviceId: number): Promise<DeviceOwner | null> {
  if (isMock()) return null;
  return withGpswoxDb(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT d.id, d.name, d.sim_number, u.id AS uid, u.email, u.phone_number
         FROM devices d LEFT JOIN user_device_pivot p ON p.device_id = d.id LEFT JOIN users u ON u.id = p.user_id
        WHERE d.id = ? AND d.deleted = 0 ORDER BY (u.group_id = 2) DESC, u.id DESC LIMIT 1`,
      [deviceId],
    );
    const r = rows[0];
    return r ? { deviceId: Number(r.id), deviceName: String(r.name ?? ""), simNumber: String(r.sim_number ?? ""), userId: r.uid ? Number(r.uid) : null, email: r.email ?? null, phone: r.phone_number ?? null } : null;
  });
}

const sameIccid = (a: string, b: string) => !!a && !!b && (a === b || (a.length >= 18 && b.length >= 18 && (a.startsWith(b) || b.startsWith(a))));
const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "sin fecha");

export async function recordEvent(iccid: string, kind: string, detail: string) {
  await prisma.simEvent.create({ data: { iccid, kind, detail } });
}

export async function applyCards(cards: TelebayCard[], carrierCode: string, owners: DeviceOwner[], now = new Date()) {
  const summary = { cards: cards.length, created: 0, changed: 0, linked: 0 };
  const carriers = await ensureCarriers();
  const known = new Map((await prisma.simCard.findMany()).map((c) => [c.iccid, c]));
  for (const card of cards) {
    const iccid = String(card.iccid ?? "").trim();
    if (!iccid) continue;
    const owner = owners.find((o) => sameIccid(o.simNumber, iccid));
    const old = known.get(iccid);
    const manual = old?.linkSource === "manual";
    const data = {
      carrierCode: carrierFor(iccid, carriers) ?? carrierCode,
      msisdn: card.msisdn,
      imsi: card.imsi,
      imei: card.imei,
      status: Number(card.status) || 0,
      packageName: cardPackage(card),
      totalMb: Number(card.totalFlow) || 0,
      usedMb: Number(card.usedFlow) || 0,
      activatedAt: telebayDate(card.activationTime),
      expiresAt: cardExpiry(card),
      country: card.countryName,
      lastSyncAt: now,
      goneAt: null,
      ...(!manual && owner
        ? { deviceId: owner.deviceId, deviceName: owner.deviceName, ownerUserId: owner.userId, ownerEmail: owner.email, ownerPhone: owner.phone, linkSource: "auto" }
        : {}),
    };
    if (!old) {
      await prisma.simCard.create({ data: { iccid, ...data } });
      await recordEvent(iccid, "new", `SIM nueva: ${statusLabel(data.status)}${owner ? ` · equipo ${owner.deviceName}` : ""}`);
      if (data.status === 2) await recordEvent(iccid, "activated", "SIM activa");
      summary.created++;
      if (owner) summary.linked++;
      continue;
    }
    await prisma.simCard.update({ where: { iccid }, data });
    const changes: [string, string][] = [];
    if (old.status !== data.status) changes.push([data.status === 2 && old.status === 1 ? "activated" : "status", `Estado: ${statusLabel(old.status)} → ${statusLabel(data.status)}`]);
    if ((old.expiresAt?.getTime() ?? 0) !== (data.expiresAt?.getTime() ?? 0)) changes.push(["expiry", `Vencimiento: ${fmt(old.expiresAt)} → ${fmt(data.expiresAt)}`]);
    if ((old.packageName ?? "") !== (data.packageName ?? "")) changes.push(["package", `Plan: ${old.packageName ?? "ninguno"} → ${data.packageName ?? "ninguno"}`]);
    if (!manual && owner && old.deviceId !== owner.deviceId) {
      changes.push(["device", `Equipo: ${old.deviceName ?? "sin equipo"} → ${owner.deviceName}`]);
      summary.linked++;
    }
    for (const [kind, detail] of changes) await recordEvent(iccid, kind, detail);
    if (changes.length) summary.changed++;
  }
  return summary;
}

export async function syncSims(now = new Date()) {
  if (!telebayConfigured()) return null;
  const [cards, owners] = await Promise.all([telebayCards(), devicesWithSim()]);
  return applyCards(cards, "telebay", owners, now);
}
