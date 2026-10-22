import type { RowDataPacket } from "mysql2/promise";
import { prisma } from "../db";
import { isMock, withGpswoxDb } from "../gpswox";
import { carrierFor, ensureCarriers, statusLabel } from "./carriers";
import { currentPackage, newsimCards, newsimConfigured, newsimLogin, newsimPackages, newsimStatus, packageEs } from "./newsim";
import { onceConfigured, onceImei, onceQuota, onceSims, onceStatus, onceToken } from "./once";
import { cardExpiry, cardPackage, telebayCards, telebayConfigured, telebayDate, type TelebayCard } from "./telebay";

// Providers without Telebay's package list pass the plan name and expiry already computed.
type SyncCard = TelebayCard & { pkg?: string | null; expiry?: Date | null; activated?: Date | null };

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

// Devices billed to a white-label company pay the agency price; the rest are direct clients of track.gpslinkusa.com.
export async function agencyByDevice(): Promise<Map<number, string>> {
  const rows = await prisma.billedDevice.findMany({ where: { removedAt: null }, select: { deviceId: true, companyId: true } });
  return new Map(rows.map((r) => [r.deviceId, r.companyId]));
}

export async function recordEvent(iccid: string, kind: string, detail: string) {
  await prisma.simEvent.create({ data: { iccid, kind, detail } });
}

export async function applyCards(cards: SyncCard[], carrierCode: string, owners: DeviceOwner[], now = new Date()) {
  const summary = { cards: cards.length, created: 0, changed: 0, linked: 0 };
  const carriers = await ensureCarriers();
  const known = new Map((await prisma.simCard.findMany()).map((c) => [c.iccid, c]));
  const agencyOf = await agencyByDevice();
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
      packageName: card.pkg !== undefined ? card.pkg : cardPackage(card),
      totalMb: Number(card.totalFlow) || 0,
      usedMb: Number(card.usedFlow) || 0,
      activatedAt: card.activated !== undefined ? card.activated : telebayDate(card.activationTime),
      expiresAt: card.expiry !== undefined ? card.expiry : cardExpiry(card),
      country: card.countryName,
      lastSyncAt: now,
      goneAt: null,
      panelOnly: false,
      ...(!manual && owner ? { companyId: agencyOf.get(owner.deviceId) ?? null } : {}),
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

// Read-only: logs in to newsimcloud, reads every eSIM and its packages, never changes anything there.
export async function syncNewsim(now = new Date()) {
  if (!newsimConfigured()) return null;
  const token = await newsimLogin();
  const [list, owners] = await Promise.all([newsimCards(token), devicesWithSim()]);
  const cards: SyncCard[] = [];
  for (const c of list) {
    const { current, next } = currentPackage(c.jtcid ? await newsimPackages(token, c.jtcid) : []);
    const name = packageEs(current?.salesName ?? c.saleName);
    cards.push({
      iccid: c.iccid,
      imei: null,
      imsi: null,
      msisdn: c.msisdn,
      activationTime: c.activateTime,
      status: newsimStatus(c.status),
      totalFlow: Number(current?.dataControl) || 0,
      usedFlow: Number(current?.useFlow ?? c.useFlow) || 0,
      countryName: null,
      endTime: null,
      pkg: name && next ? `${name} · luego ${packageEs(next.salesName)}` : name,
      expiry: telebayDate(current?.expireTime),
    });
    await new Promise((ok) => setTimeout(ok, 150));
  }
  return applyCards(cards, "newsimcloud", owners, now);
}

// Read-only: 1NCE SIMs with their data quota; expiry comes from the quota (the SIM lifetime).
export async function syncOnce(now = new Date()) {
  if (!onceConfigured()) return null;
  const token = await onceToken();
  const [list, owners] = await Promise.all([onceSims(token), devicesWithSim()]);
  const cards: SyncCard[] = [];
  for (const s of list) {
    const q = await onceQuota(token, s.iccid).catch(() => null);
    const total = Number(q?.total_volume) || 0;
    cards.push({
      iccid: s.iccid,
      imei: onceImei(s.imei),
      imsi: s.imsi,
      msisdn: s.msisdn,
      activationTime: s.activation_date,
      activated: s.activation_date ? new Date(s.activation_date.replace(/\+0000$/, "Z")) : null,
      status: onceStatus(s.status),
      totalFlow: total,
      usedFlow: q?.volume != null ? Math.max(0, total - Number(q.volume)) : 0,
      countryName: null,
      endTime: null,
      pkg: total ? `${total} MB` : null,
      expiry: q?.expiry_date ? new Date(`${q.expiry_date.replace(" ", "T")}Z`) : null,
    });
  }
  return applyCards(cards, "1nce", owners, now);
}

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

// Copies the provider's SIM data to the GPS Link device profile (provider wins when it has a value; junk like a trailing "F" is cleaned).
export async function fillDeviceProfiles(carrierCode?: string) {
  if (isMock()) return 0;
  const cards = await prisma.simCard.findMany({ where: { goneAt: null, deviceId: { not: null }, ...(carrierCode ? { carrierCode } : {}) } });
  if (!cards.length) return 0;
  return withGpswoxDb(async (conn) => {
    let changed = 0;
    for (const c of cards) {
      const act = ymd(c.activatedAt);
      const exp = ymd(c.expiresAt);
      const [r] = await conn.execute(
        `UPDATE devices SET
           sim_number = IF(sim_number <> ? AND sim_number LIKE CONCAT(?, '%'), ?, sim_number),
           msisdn = IF(? IS NOT NULL, ?, msisdn),
           sim_activation_date = IF(? IS NOT NULL, ?, sim_activation_date),
           sim_expiration_date = IF(? IS NOT NULL, ?, sim_expiration_date)
         WHERE id = ?`,
        [c.iccid, c.iccid, c.iccid, c.msisdn, c.msisdn, act, act, exp, exp, c.deviceId],
      );
      changed += Number((r as { changedRows?: number }).changedRows ?? 0);
    }
    return changed;
  });
}

// 1NCE quota is cheap to read (official API): refresh used data daily so the low-data alert is on time.
export async function refreshOnceQuota() {
  if (!onceConfigured()) return 0;
  const cards = await prisma.simCard.findMany({ where: { carrierCode: "1nce", goneAt: null } });
  if (!cards.length) return 0;
  const token = await onceToken();
  let n = 0;
  for (const c of cards) {
    const q = await onceQuota(token, c.iccid).catch(() => null);
    const total = Number(q?.total_volume) || 0;
    if (!q || !total || q.volume == null) continue;
    await prisma.simCard.update({ where: { iccid: c.iccid }, data: { totalMb: total, usedMb: Math.max(0, total - Number(q.volume)), packageName: `${total} MB` } });
    n++;
  }
  return n;
}

export type SimMismatch = { iccid: string; carrierCode: string; imei: string; linkedId: number | null; linkedName: string | null; actualId: number | null; actualName: string | null };

// The provider sees the SIM inside a device (by IMEI). Compare the first 14 digits (providers report IMEISV / no check digit).
export async function simMismatches(): Promise<SimMismatch[]> {
  if (isMock()) return [];
  const cards = (await prisma.simCard.findMany({ where: { goneAt: null, imei: { not: null } } })).filter((c) => /^\d{14,}$/.test(c.imei ?? ""));
  if (!cards.length) return [];
  const prefixes = [...new Set(cards.map((c) => c.imei!.slice(0, 14)))];
  const linked = [...new Set(cards.map((c) => c.deviceId).filter((id): id is number => !!id))];
  const rows = await withGpswoxDb(async (conn) => {
    const [r] = await conn.query<RowDataPacket[]>(
      `SELECT id, name, imei FROM devices WHERE deleted = 0 AND (LEFT(imei, 14) IN (?)${linked.length ? " OR id IN (?)" : ""})`,
      linked.length ? [prefixes, linked] : [prefixes],
    );
    return r as { id: number; name: string; imei: string }[];
  });
  const out: SimMismatch[] = [];
  for (const c of cards) {
    const p = c.imei!.slice(0, 14);
    const actual = rows.find((d) => String(d.imei).slice(0, 14) === p) ?? null;
    const own = c.deviceId ? rows.find((d) => d.id === c.deviceId) : null;
    if (own && !/^\d{15}$/.test(String(own.imei)) && !actual) continue;
    if (actual && actual.id === c.deviceId) continue;
    out.push({ iccid: c.iccid, carrierCode: c.carrierCode, imei: c.imei!, linkedId: c.deviceId, linkedName: c.deviceName, actualId: actual?.id ?? null, actualName: actual?.name ?? null });
  }
  return out;
}

// Puts the SIM in the device that really has it and clears it from any other device profile.
export async function moveSimToDevice(iccid: string, deviceId: number) {
  await withGpswoxDb(async (conn) => {
    await conn.execute("UPDATE devices SET sim_number = ? WHERE id = ?", [iccid, deviceId]);
    await conn.execute("UPDATE devices SET sim_number = '' WHERE id <> ? AND sim_number LIKE CONCAT(?, '%')", [deviceId, iccid]);
  });
}
