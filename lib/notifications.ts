import type { RowDataPacket } from "mysql2/promise";
import { BRAND } from "./config";
import { prisma } from "./db";
import { isMock, withGpswoxDb } from "./gpswox";
import { emailHtml, sendEmail, sendWhatsApp, type ChannelResult } from "./notify";
import { DIRECT_WA, queueWa } from "./wa";

// Catalog of notifications the platform can deliver and, per notification, who gets it and by which channel.
// Vehicle notifications come from GPSWOX alerts (events table) or from our own telemetry checks (device-status.ts).

export type Channels = { clientWa: boolean; clientEmail: boolean; brandWa: boolean; brandEmail: boolean };
export type NotificationKind = { key: string; label: string; group: "vehiculo" | "cuenta"; events?: string[]; defaults: Partial<Channels> };

const CLIENT_WA = { clientWa: true };
const CLIENT_BRAND_WA = { clientWa: true, brandWa: true };

export const NOTIFICATIONS: NotificationKind[] = [
  { key: "sos", label: "SOS (botón de pánico)", group: "vehiculo", events: ["sos"], defaults: { clientWa: true, clientEmail: true, brandWa: true } },
  { key: "zone_red", label: "Zona roja: a menos de 10 km de Haití o zona roja creada con el asistente (emergencia y apagado del motor)", group: "vehiculo", defaults: { clientWa: true, clientEmail: true, brandWa: true } },
  { key: "zone_pink", label: "Zona rosada: a menos de 30 km de Haití", group: "vehiculo", defaults: { clientWa: true, clientEmail: true } },
  { key: "zone_yellow", label: "Zona amarilla: a menos de 100 km de Haití", group: "vehiculo", defaults: CLIENT_WA },
  { key: "zone_exit", label: "Salió de las zonas de la frontera o de una zona roja", group: "vehiculo", defaults: CLIENT_WA },
  { key: "power_cut", label: "Desconectado de la corriente (revisión automática)", group: "vehiculo", defaults: CLIENT_BRAND_WA },
  { key: "low_battery", label: "Batería baja (revisión automática)", group: "vehiculo", defaults: CLIENT_BRAND_WA },
  { key: "offline", label: "Sin reportar (revisión automática)", group: "vehiculo", defaults: CLIENT_BRAND_WA },
  { key: "overspeed", label: "Exceso de velocidad", group: "vehiculo", events: ["overspeed"], defaults: CLIENT_WA },
  { key: "ignition", label: "Encendido / apagado", group: "vehiculo", events: ["ignition_on", "ignition_off"], defaults: CLIENT_WA },
  { key: "move_start", label: "Inicio de movimiento", group: "vehiculo", events: ["move_start", "move_start_filtered"], defaults: CLIENT_WA },
  { key: "stop_duration", label: "Detenido más de X minutos", group: "vehiculo", events: ["stop_duration"], defaults: CLIENT_WA },
  { key: "idle_duration", label: "Motor encendido sin moverse (ralentí)", group: "vehiculo", events: ["idle_duration"], defaults: CLIENT_WA },
  { key: "ignition_duration", label: "Encendido más de X minutos", group: "vehiculo", events: ["ignition_duration"], defaults: CLIENT_WA },
  { key: "move_duration", label: "En movimiento más de X minutos", group: "vehiculo", events: ["move_duration"], defaults: CLIENT_WA },
  { key: "offline_duration", label: "Sin reportar más de X minutos (alerta del cliente)", group: "vehiculo", events: ["offline_duration"], defaults: CLIENT_WA },
  { key: "time_duration", label: "Alerta de horario", group: "vehiculo", events: ["time_duration"], defaults: CLIENT_WA },
  { key: "geofence", label: "Entra / sale de geocerca", group: "vehiculo", events: ["zone_in", "zone_out"], defaults: CLIENT_WA },
  { key: "unplugged", label: "Equipo desconectado / conectado (alerta del cliente)", group: "vehiculo", events: ["unplugged", "plugged_in"], defaults: CLIENT_WA },
  { key: "fuel", label: "Combustible (llenado o robo)", group: "vehiculo", events: ["fuel_fill", "fuel_theft"], defaults: CLIENT_WA },
  { key: "distance", label: "Distancia recorrida", group: "vehiculo", events: ["distance"], defaults: CLIENT_WA },
  { key: "poi", label: "Parada o ralentí en punto de interés", group: "vehiculo", events: ["poi_stop_duration", "poi_idle_duration"], defaults: CLIENT_WA },
  { key: "driver", label: "Cambio de conductor / conductor no autorizado", group: "vehiculo", events: ["driver", "driver_authorized", "driver_unauthorized"], defaults: CLIENT_WA },
  { key: "custom", label: "Eventos personalizados (puerta, corte de motor…)", group: "vehiculo", events: ["custom"], defaults: CLIENT_WA },
  { key: "task", label: "Tareas", group: "vehiculo", events: ["task_new", "task_complete", "task_failed", "task_in_progress"], defaults: CLIENT_WA },
  { key: "device_expiration", label: "Equipo por vencer / vencido", group: "vehiculo", events: ["expiring_device", "expired_device", "device_subscription_expired"], defaults: CLIENT_WA },
  { key: "sim_expiration", label: "SIM por vencer / vencida (alerta del cliente)", group: "vehiculo", events: ["expiring_sim", "expired_sim"], defaults: CLIENT_WA },
  { key: "activation_instructions", label: "Instrucciones para conectar el equipo", group: "cuenta", defaults: { clientEmail: true } },
  { key: "activation_active", label: "Equipo activado", group: "cuenta", defaults: { clientEmail: true } },
  { key: "payment_failed", label: "Pago o renovación rechazada", group: "cuenta", defaults: { clientEmail: true } },
  { key: "sim_renewal", label: "SIM: renovación en 10 días (con enlace de pago) y SIM reactivada", group: "cuenta", defaults: { clientWa: true, clientEmail: true, brandWa: true, brandEmail: true } },
];

export const CHANNEL_KEYS = ["clientWa", "clientEmail", "brandWa", "brandEmail"] as const;
const NONE: Channels = { clientWa: false, clientEmail: false, brandWa: false, brandEmail: false };

export async function notificationRules(): Promise<Map<string, Channels>> {
  const saved = new Map((await prisma.notificationRule.findMany()).map((r) => [r.kind, r]));
  return new Map(
    NOTIFICATIONS.map((n) => {
      const r = saved.get(n.key);
      return [n.key, r ? { clientWa: r.clientWa, clientEmail: r.clientEmail, brandWa: r.brandWa, brandEmail: r.brandEmail } : { ...NONE, ...n.defaults }];
    }),
  );
}

export const kindForEvent = (type: string) => NOTIFICATIONS.find((n) => n.events?.includes(type))?.key ?? null;

export type Audience = { gpswoxUserId?: number | null; email?: string | null; phone?: string | null; companyId?: string | null };
export type Message = { subject: string; title: string; lines: string[]; cta?: { label: string; url: string } };

// The client is the vehicle owner (WhatsApp linked to the assistant, or the phone/email given); the brand is the white label that bills the device.
export async function notify(kind: string, aud: Audience, msg: Message, opts: { rules?: Map<string, Channels>; done?: Set<string> } = {}): Promise<ChannelResult[]> {
  const rule = (opts.rules ?? (await notificationRules())).get(kind);
  if (!rule) return [];
  const done = opts.done ?? new Set<string>();
  const company = aud.companyId ? await prisma.company.findUnique({ where: { id: aud.companyId } }) : null;
  const brand = company && company.status !== "CANCELED" ? company : null;
  const from = { name: brand?.name ?? BRAND.name, contact: brand?.email ?? BRAND.supportEmail };
  const text = [`*${msg.title}*`, ...msg.lines, msg.cta?.url ?? ""].filter(Boolean).join("\n");
  const html = emailHtml(msg.title, msg.lines, msg.cta, from);
  const results: ChannelResult[] = [];
  const send = async (key: string, fn: () => Promise<ChannelResult>) => {
    if (done.has(key)) return;
    done.add(key);
    results.push(await fn().catch((e): ChannelResult => ({ channel: key.startsWith("em:") ? "email" : "whatsapp", ok: false, error: String(e) })));
  };
  const viaBrand = async (companyId: string, phone: string, fallback: boolean): Promise<ChannelResult> =>
    (await queueWa(companyId, phone, text)) ? { channel: "whatsapp", ok: true } : fallback ? sendWhatsApp(phone, text) : { channel: "whatsapp", ok: false, error: "WhatsApp de la marca no conectado" };
  const email = (to: string) => sendEmail(to, msg.subject, html, { fromName: from.name, replyTo: from.contact });

  if (rule.clientWa) {
    if (aud.gpswoxUserId) {
      for (const l of await prisma.waLink.findMany({ where: { gpswoxUserId: aud.gpswoxUserId } })) {
        if (l.companyId === DIRECT_WA) await send(`wa:${l.phone}`, () => sendWhatsApp(l.phone, text));
        else if (!brand || l.companyId === brand.id) await send(`wa:${l.phone}`, () => viaBrand(l.companyId, l.phone, false));
      }
    }
    const phone = aud.phone;
    if (phone) await send(`wa:${phone}`, () => (brand ? viaBrand(brand.id, phone, true) : sendWhatsApp(phone, text)));
  }
  if (rule.clientEmail && aud.email) await send(`em:${aud.email.toLowerCase()}`, () => email(aud.email!));
  if (brand && rule.brandWa && brand.phone) await send(`wa:${brand.phone}`, () => viaBrand(brand.id, brand.phone, true));
  if (brand && rule.brandEmail && brand.email) await send(`em:${brand.email.toLowerCase()}`, () => email(brand.email));
  return results;
}

const EVENT_TITLE: Record<string, string> = {
  sos: "SOS: botón de pánico",
  overspeed: "Exceso de velocidad",
  ignition_on: "Motor encendido",
  ignition_off: "Motor apagado",
  move_start: "Empezó a moverse",
  move_start_filtered: "Empezó a moverse",
  stop_duration: "Lleva mucho tiempo detenido",
  idle_duration: "Motor encendido sin moverse",
  ignition_duration: "Lleva mucho tiempo encendido",
  move_duration: "Lleva mucho tiempo en movimiento",
  offline_duration: "Lleva tiempo sin reportar",
  time_duration: "Alerta de horario",
  zone_in: "Entró a la geocerca",
  zone_out: "Salió de la geocerca",
  unplugged: "El equipo se desconectó",
  plugged_in: "El equipo se conectó",
  fuel_fill: "Llenado de combustible",
  fuel_theft: "Posible robo de combustible",
  distance: "Alcanzó la distancia",
  poi_stop_duration: "Detenido en un punto de interés",
  poi_idle_duration: "Ralentí en un punto de interés",
  driver: "Cambio de conductor",
  driver_authorized: "Conductor autorizado",
  driver_unauthorized: "Conductor no autorizado",
  task_new: "Tarea nueva",
  task_complete: "Tarea completada",
  task_failed: "Tarea fallida",
  task_in_progress: "Tarea en proceso",
  expiring_device: "El equipo está por vencer",
  expired_device: "El equipo venció",
  device_subscription_expired: "El equipo venció",
  expiring_sim: "La SIM está por vencer",
  expired_sim: "La SIM venció",
};

const fmt = (d: Date) => d.toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "short", timeStyle: "short" });

export type GpsEvent = { id: number; userId: number; deviceId: number | null; type: string; message: string; address: string | null; additional: string | null; time: Date | null; email: string | null; groupId: number; device: string | null; plate: string | null };

export function eventMessage(e: GpsEvent, brand: string): Message {
  let extra: Record<string, unknown> = {};
  try {
    extra = e.additional ? (JSON.parse(e.additional) as Record<string, unknown>) : {};
  } catch {}
  const title = e.type === "custom" ? e.message || "Evento del equipo" : (EVENT_TITLE[e.type] ?? (e.message || e.type));
  const vehicle = e.device ? (e.plate ? `${e.device} (${e.plate})` : e.device) : "Tu vehículo";
  const lines = [`${vehicle}: ${title}.`];
  if (extra.overspeed_speed) lines.push(`Velocidad: ${extra.overspeed_speed} km/h.`);
  if (extra.geofence) lines.push(`Geocerca: ${extra.geofence}.`);
  if (extra.stop_duration) lines.push(`Tiempo: ${extra.stop_duration} minutos.`);
  if (e.address) lines.push(`Lugar: ${e.address}`);
  if (e.time) lines.push(`Hora: ${fmt(e.time)}`);
  return { subject: `${title}: ${vehicle}`, title: `Aviso de ${brand}`, lines };
}

async function readEvents(afterId: number): Promise<{ maxId: number; events: GpsEvent[] }> {
  return withGpswoxDb(async (conn) => {
    if (afterId === 0) {
      const [[row]] = await conn.query<RowDataPacket[]>("SELECT COALESCE(MAX(id), 0) AS id FROM events");
      return { maxId: Number(row.id), events: [] };
    }
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT e.id, e.user_id, e.device_id, e.type, e.message, e.address, e.additional, DATE_FORMAT(e.time, '%Y-%m-%dT%H:%i:%sZ') AS t,
              u.email, u.group_id, d.name, d.plate_number
         FROM events e JOIN users u ON u.id = e.user_id LEFT JOIN devices d ON d.id = e.device_id
        WHERE e.id > ? AND e.deleted = 0 ORDER BY e.id LIMIT 500`,
      [afterId],
    );
    const events = rows.map((r) => ({
      id: Number(r.id),
      userId: Number(r.user_id),
      deviceId: r.device_id ? Number(r.device_id) : null,
      type: String(r.type ?? ""),
      message: String(r.message ?? ""),
      address: r.address ? String(r.address) : null,
      additional: r.additional ? String(r.additional) : null,
      time: r.t ? new Date(String(r.t)) : null,
      email: r.email ? String(r.email) : null,
      groupId: Number(r.group_id),
      device: r.name ? String(r.name) : null,
      plate: r.plate_number ? String(r.plate_number) : null,
    }));
    return { maxId: events.length ? events[events.length - 1].id : afterId, events };
  });
}

// Alerts each customer set up in the tracking platform, delivered by WhatsApp/email per the rules. Admin accounts (group 1) are skipped:
// they already see their alerts in the platform. The first run only records where to start.
export async function runEventNotifications(): Promise<{ read: number; sent: number }> {
  const out = { read: 0, sent: 0 };
  if (isMock()) return out;
  const setting = await prisma.alertSetting.findUnique({ where: { id: 1 } });
  if (!setting?.enabled) return out;
  const { maxId, events } = await readEvents(setting.lastEventId);
  const rules = await notificationRules();
  const devices = [...new Set(events.map((e) => e.deviceId).filter((d): d is number => d !== null))];
  const billed = devices.length ? await prisma.billedDevice.findMany({ where: { deviceId: { in: devices }, removedAt: null }, include: { company: true } }) : [];
  for (const e of events) {
    out.read++;
    const kind = kindForEvent(e.type);
    if (!kind || e.groupId === 1) continue;
    const company = billed.find((b) => b.deviceId === e.deviceId)?.company ?? null;
    const brand = company && company.status !== "CANCELED" ? company : null;
    const res = await notify(kind, { gpswoxUserId: e.userId, email: e.email, companyId: brand?.id ?? null }, eventMessage(e, brand?.name ?? BRAND.name), { rules });
    out.sent += res.filter((r) => r.ok).length;
  }
  if (maxId !== setting.lastEventId) await prisma.alertSetting.update({ where: { id: 1 }, data: { lastEventId: maxId } });
  return out;
}
