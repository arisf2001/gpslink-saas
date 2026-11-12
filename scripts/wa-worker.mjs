// GPS Link WhatsApp (QR) — pm2 app "gpslink-wa". One WhatsApp session per white label.
// Wanted/actual state lives in WaSession; replies come from the app (/api/internal/wa); notices go out through WaOutbox.
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { createHmac } from "crypto";
import path from "path";
import pino from "pino";
import { PrismaClient } from "@prisma/client";
import makeWASocket, { Browsers, DisconnectReason, downloadMediaMessage, fetchLatestBaileysVersion, useMultiFileAuthState as loadAuthState } from "@whiskeysockets/baileys";

for (const f of [".env.production.local", ".env.local", ".env"]) {
  try { process.loadEnvFile(f); } catch {}
}
const prisma = new PrismaClient();
const ROOT = path.join(process.env.STORAGE_DIR || path.join(process.cwd(), "storage"), "wa");
const APP = process.env.WA_APP_URL || `http://127.0.0.1:${process.env.PORT || 3010}/api/internal/wa`;
const KEY = createHmac("sha256", process.env.SESSION_SECRET || "").update("gpslink-wa-internal").digest("hex");
const PAUSE_MS = 2 * 60 * 60_000;
const logger = pino({ level: "silent" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const digitsOf = (jid) => (jid || "").split("@")[0].split(":")[0] || null;
const skip = (jid) => !jid || jid.endsWith("@g.us") || jid.endsWith("@broadcast") || jid.endsWith("@newsletter");
const contentOf = (m) => m.message?.ephemeralMessage?.message || m.message?.viewOnceMessage?.message || m.message || {};
const log = (...a) => console.log(new Date().toISOString(), "gpslink-wa:", ...a);
const noPhoneResend = { get: () => true, set: () => true, del: () => 0, flushAll: () => {} };

const sessions = new Map();
const update = (companyId, data) => prisma.waSession.update({ where: { companyId }, data }).catch(() => {});

async function ask(body) {
  const r = await fetch(APP, { method: "POST", headers: { "Content-Type": "application/json", "x-wa-key": KEY }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
  return r.ok ? r.json() : {};
}

async function handle(entry, m) {
  const { sock, companyId } = entry;
  const jid = m.key.remoteJid;
  if ((entry.paused.get(jid) || 0) > Date.now()) return log(companyId, "chat en pausa (respuesta manual)");
  const x = contentOf(m);
  const text = x.conversation || x.extendedTextMessage?.text || x.imageMessage?.caption || "";
  const pn = m.key.senderPn || m.key.participantPn;
  if (jid.endsWith("@lid") && pn) remember(entry, [[jid, pn]]);
  if (jid.endsWith("@lid") && !pn && !entry.lids.has(digitsOf(jid)) && Date.now() - entry.learnedAt > 10 * 60_000) await learnLids(entry);
  const phone = digitsOf(jid.endsWith("@lid") ? pn || entry.lids.get(digitsOf(jid)) : jid);
  if (!phone) return log(companyId, "mensaje sin número", jid.split("@")[1]);
  await sock.readMessages([m.key]).catch(() => {});
  const note = x.audioMessage && Number(x.audioMessage.seconds || 0) <= 180 ? x.audioMessage : null;
  if (!text && !note) return;
  const audio = note ? await downloadMediaMessage(m, "buffer", {}, { logger, reuploadRequest: sock.updateMediaMessage }).catch(() => null) : null;
  await sock.sendPresenceUpdate(note ? "recording" : "composing", jid).catch(() => {});
  const res = await ask({ companyId, phone, text, ...(audio ? { audio: audio.toString("base64"), mime: note.mimetype } : {}) }).catch((e) => { console.error("gpslink-wa: app", e?.message); return {}; });
  if (res.audio) {
    const r = await sock.sendMessage(jid, { audio: Buffer.from(res.audio, "base64"), mimetype: "audio/ogg; codecs=opus", ptt: true });
    if (r?.key?.id) entry.sentByBot.add(r.key.id);
    if (res.link) {
      const l = await sock.sendMessage(jid, { text: res.link });
      if (l?.key?.id) entry.sentByBot.add(l.key.id);
    }
  } else if (res.reply) {
    await sleep(1500 + Math.min(res.reply.length * 15, 4000));
    const r = await sock.sendMessage(jid, { text: res.reply });
    if (r?.key?.id) entry.sentByBot.add(r.key.id);
  }
  log(companyId, `${note ? "voz" : "texto"} de ...${phone.slice(-4)}:`, res.audio ? "respondió con voz" : res.reply ? "respondió" : "sin respuesta");
  await sock.sendPresenceUpdate("paused", jid).catch(() => {});
}

function enqueue(entry, jid, fn) {
  const prev = entry.queues.get(jid) || Promise.resolve();
  const next = prev.then(fn).catch((e) => console.error("gpslink-wa:", e?.message || e)).finally(() => { if (entry.queues.get(jid) === next) entry.queues.delete(jid); });
  entry.queues.set(jid, next);
}

// WhatsApp may hide the sender's number behind a LID: keep a LID -> phone map from contacts and messages that carry both.
function remember(entry, pairs) {
  let changed = false;
  for (const [lid, pn] of pairs) {
    const l = digitsOf(lid);
    const p = digitsOf(pn);
    if (!l || !p || !String(lid).endsWith("@lid") || !String(pn).endsWith("@s.whatsapp.net") || entry.lids.get(l) === p) continue;
    entry.lids.set(l, p);
    changed = true;
  }
  if (changed) writeFile(path.join(entry.dir, "lid-map.json"), JSON.stringify(Object.fromEntries(entry.lids)), { mode: 0o600 }).catch(() => {});
}

// Ask WhatsApp for the LID of every profile number.
async function learnLids(entry) {
  entry.learnedAt = Date.now();
  try {
    const r = await fetch(`${APP}/phones`, { headers: { "x-wa-key": KEY }, signal: AbortSignal.timeout(60_000) });
    const phones = r.ok ? (await r.json()).phones || [] : [];
    for (let i = 0; i < phones.length; i += 50) {
      const found = await entry.sock.onWhatsApp(...phones.slice(i, i + 50).map((p) => `${p}@s.whatsapp.net`)).catch(() => []);
      remember(entry, (found || []).filter((f) => f.lid).map((f) => [f.lid, f.jid]));
    }
    log(entry.companyId, `números de perfil: ${phones.length}, con código de WhatsApp: ${entry.lids.size}`);
  } catch (e) {
    log(entry.companyId, "no pude leer los números de perfil", e?.message);
  }
}

const contactPairs = (list) => (list || []).flatMap((c) => [[c.lid, c.id], [c.id, c.jid || c.phoneNumber]].filter(([a, b]) => a && b));

async function start(companyId) {
  const dir = path.join(ROOT, companyId.replace(/[^a-z0-9]/gi, ""));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const { state, saveCreds } = await loadAuthState(dir);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  const sock = makeWASocket({ auth: state, logger, version, browser: Browsers.ubuntu("GPS Link"), markOnlineOnConnect: false, syncFullHistory: false, shouldIgnoreJid: skip, placeholderResendCache: noPhoneResend });
  const saved = await readFile(path.join(dir, "lid-map.json"), "utf8").then(JSON.parse).catch(() => ({}));
  const entry = { companyId, dir, sock, open: false, stopping: false, sentByBot: new Set(), queues: new Map(), paused: new Map(), lids: new Map(Object.entries(saved)), learnedAt: 0 };
  sessions.set(companyId, entry);
  await update(companyId, { status: "CONNECTING", error: null });
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async (u) => {
    if (u.qr) await update(companyId, { qr: u.qr, status: "QR" });
    if (u.connection === "open") {
      entry.open = true;
      log(companyId, "conectado");
      await update(companyId, { qr: null, status: "CONNECTED", phone: digitsOf(sock.user?.id), error: null });
      setTimeout(() => learnLids(entry), 10_000);
    }
    if (u.connection === "close") {
      entry.open = false;
      if (sessions.get(companyId) === entry) sessions.delete(companyId);
      if (entry.stopping) return;
      const code = u.lastDisconnect?.error?.output?.statusCode;
      log(companyId, "desconectado", code);
      if (code === DisconnectReason.loggedOut) {
        await rm(dir, { recursive: true, force: true });
        await update(companyId, { want: false, status: "OFF", phone: null, qr: null, error: "Se cerró la sesión desde el teléfono." });
      } else if (!state.creds.me && code !== DisconnectReason.restartRequired) {
        await update(companyId, { want: false, status: "OFF", qr: null, error: "El código QR venció. Pulsa Conectar otra vez." });
      } else await update(companyId, { status: "CONNECTING" });
    }
  });
  sock.ev.on("contacts.upsert", (list) => remember(entry, contactPairs(list)));
  sock.ev.on("contacts.update", (list) => remember(entry, contactPairs(list)));
  sock.ev.on("chats.phoneNumberShare", ({ lid, jid }) => remember(entry, [[lid, jid]]));
  sock.ev.on("messaging-history.set", ({ contacts, chats }) => remember(entry, [...contactPairs(contacts), ...(chats || []).map((c) => [c.lidJid, c.id])]));
  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages) {
      const jid = m.key.remoteJid;
      if (skip(jid) || !m.message || !m.key.id || m.message.protocolMessage || m.message.reactionMessage) continue;
      if (Number(m.messageTimestamp || 0) * 1000 < Date.now() - 5 * 60_000) continue;
      if (m.key.fromMe) {
        setTimeout(() => { if (!entry.sentByBot.has(m.key.id)) entry.paused.set(jid, Date.now() + PAUSE_MS); }, 3000);
        continue;
      }
      enqueue(entry, jid, () => handle(entry, m));
    }
  });
}

async function stop(entry) {
  sessions.delete(entry.companyId);
  entry.stopping = true;
  await entry.sock.logout().catch(() => entry.sock.end(undefined));
  await rm(entry.dir, { recursive: true, force: true });
  await update(entry.companyId, { status: "OFF", phone: null, qr: null });
}

async function flushOutbox(entry) {
  const rows = await prisma.waOutbox.findMany({ where: { companyId: entry.companyId, status: "pending" }, orderBy: { id: "asc" }, take: 5 });
  for (const r of rows) {
    try {
      const jid = `${r.phone}@s.whatsapp.net`;
      const [hit] = await entry.sock.onWhatsApp(jid).catch(() => []);
      if (hit && hit.exists === false) throw new Error("Ese número no tiene WhatsApp.");
      const sent = await entry.sock.sendMessage(hit?.jid || jid, { text: r.text });
      if (sent?.key?.id) entry.sentByBot.add(sent.key.id);
      await prisma.waOutbox.update({ where: { id: r.id }, data: { status: "sent", sentAt: new Date() } });
    } catch (e) {
      await prisma.waOutbox.update({ where: { id: r.id }, data: { status: "error", error: String(e?.message || e).slice(0, 300) } }).catch(() => {});
    }
    await sleep(2000);
  }
}

log("iniciado");
for (;;) {
  try {
    const rows = await prisma.waSession.findMany();
    await prisma.waSession.updateMany({ data: { beatAt: new Date() } });
    for (const s of rows) {
      const entry = sessions.get(s.companyId);
      if (s.want && !entry) await start(s.companyId).catch((e) => update(s.companyId, { status: "ERROR", error: String(e?.message || e).slice(0, 300) }));
      if (!s.want && entry) await stop(entry);
      if (entry?.open) await flushOutbox(entry);
    }
  } catch (e) {
    console.error("gpslink-wa:", e?.message || e);
  }
  await sleep(3000);
}
