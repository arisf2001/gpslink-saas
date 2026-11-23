import { prisma } from "../db";
import { aiSetting, assistantConfig, createConfirm, createZoneConfirm, hasPin, t, type AiUser, type Channel, type Lang, type PendingConfirm } from "./assistant";
import * as gps from "./gps";
import { mapAreaAt, zoneAt } from "./areas";
import { findPlace, insidePlace, reverseGeocode } from "./geocode";
import { createRedZone, deleteRedZone, listRedZones, MAX_ZONE_KM, zoneDevices, zoneShape } from "../red-zones";
import { CUT_SPEED_KMH } from "../border-zones";
import { deviceStatuses } from "../device-status";
import { withGpswoxDb } from "../gpswox";
import { statusLabel } from "../sim/carriers";
import type { RowDataPacket } from "mysql2/promise";
import { colorName, matchesVehicle, typeName, vehicleProfiles, type VehicleProfile } from "../vehicle-profile";

const describe = (p: VehicleProfile | undefined) =>
  p && Object.values(p).some(Boolean)
    ? { nickname: p.nickname, make: p.brand, model: p.model, year: p.year, color: colorName(p.color), vehicle_type: typeName(p.type) }
    : {};

export type AiAction =
  | { type: "open_map"; device_id: number; lat: number; lng: number; label: string; url: string }
  | { type: "street_view"; device_id: number; lat: number; lng: number; url: string; label: string }
  | { type: "open_history"; device_id: number; from: string; to: string; label: string };

export type ChatResult = { conversation_id: string; reply: string; actions: AiAction[]; confirm: PendingConfirm | null };

type Msg = { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string };
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

const MAX_HISTORY = 12;
const MAX_ROUNDS = 6;

const TOOLS = [
  { type: "function", function: { name: "list_vehicles", description: "List the customer's vehicles with status, make, model, year, color, type and nickname. Use it to find a vehicle by name, plate, nickname, color, make, model or type (e.g. 'la jeepeta', 'el carro rojo', 'el Toyota').", parameters: { type: "object", properties: { search: { type: "string", description: "Optional filter: name, plate, nickname, color, make, model or type, in the customer's words" } }, additionalProperties: false } } },
  { type: "function", function: { name: "get_vehicle", description: "Current location, address, speed, ignition and last report of one vehicle.", parameters: { type: "object", properties: { device_id: { type: "integer" } }, required: ["device_id"], additionalProperties: false } } },
  { type: "function", function: { name: "create_alert", description: "Create an alert for one vehicle, sent to the app and WhatsApp: movement (starts moving), overspeed (above speed_kmh) or stop (stopped longer than minutes).", parameters: { type: "object", properties: { device_id: { type: "integer" }, kind: { type: "string", enum: ["movement", "overspeed", "stop"] }, speed_kmh: { type: "number" }, minutes: { type: "number" } }, required: ["device_id", "kind"], additionalProperties: false } } },
  { type: "function", function: { name: "save_customer_name", description: "Save the customer's first and last name on their account when it is missing (only when they tell you their name). It cannot change email or phone.", parameters: { type: "object", properties: { first_name: { type: "string" }, last_name: { type: "string" } }, required: ["first_name"], additionalProperties: false } } },
  { type: "function", function: { name: "membership_payment_link", description: "Payment link (GHL) to renew one vehicle's yearly GPS membership / SIM data plan at the price set in the system. When paid, the membership is renewed.", parameters: { type: "object", properties: { device_id: { type: "integer" } }, required: ["device_id"], additionalProperties: false } } },
  { type: "function", function: { name: "activate_device", description: "Start activating a new GPS device on the customer's account from its IMEI/ID (e.g. read from a photo): returns the SMS programming instructions and the link to save the card (charged only after it stays connected).", parameters: { type: "object", properties: { imei: { type: "string" }, model: { type: "string", enum: ["gt06", "sinotrack"] }, name: { type: "string" } }, required: ["imei", "model"], additionalProperties: false } } },
  { type: "function", function: { name: "find_clients", description: "OWNER ONLY: search any tracking client by email, phone or name; returns account id, status, expiry and device count.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } } },
  { type: "function", function: { name: "client_vehicles", description: "OWNER ONLY: vehicles of one client account (id from find_clients) with membership expiry and last report.", parameters: { type: "object", properties: { user_id: { type: "integer" } }, required: ["user_id"], additionalProperties: false } } },
  { type: "function", function: { name: "set_client_active", description: "OWNER ONLY: activate or suspend a client account by email.", parameters: { type: "object", properties: { email: { type: "string" }, active: { type: "boolean" } }, required: ["email", "active"], additionalProperties: false } } },
  { type: "function", function: { name: "extend_membership", description: "OWNER ONLY: extend one device's membership by some months (from today if already expired).", parameters: { type: "object", properties: { device_id: { type: "integer" }, months: { type: "integer" } }, required: ["device_id", "months"], additionalProperties: false } } },
  { type: "function", function: { name: "check_service", description: "Why a vehicle is not updating / offline: GPS Link membership and account expiration, SIM data plan (status, expiry, data used) and GPS device power/signal.", parameters: { type: "object", properties: { device_id: { type: "integer" } }, required: ["device_id"], additionalProperties: false } } },
  { type: "function", function: { name: "vehicles_in_place", description: "Which of the customer's vehicles are now inside a city, state, province, neighbourhood or country (e.g. 'Allentown', 'Florida', 'Santo Domingo', 'República Dominicana').", parameters: { type: "object", properties: { place: { type: "string", description: "Place name, adding the state or country when it is ambiguous (e.g. 'Santiago, República Dominicana')" } }, required: ["place"], additionalProperties: false } } },
  { type: "function", function: { name: "send_location_whatsapp", description: "Send one vehicle's current location (address, nearby place and map link) to the customer's OWN WhatsApp: the number in their tracking platform profile (and any WhatsApp linked to the account). It never sends to other numbers.", parameters: { type: "object", properties: { device_id: { type: "integer" } }, required: ["device_id"], additionalProperties: false } } },
  { type: "function", function: { name: "get_history", description: "Trips summary for a vehicle between two local datetimes (America/Santo_Domingo): distance, top speed, moving/stopped time and stops.", parameters: { type: "object", properties: { device_id: { type: "integer" }, from: { type: "string", description: "YYYY-MM-DD HH:MM" }, to: { type: "string", description: "YYYY-MM-DD HH:MM" } }, required: ["device_id", "from", "to"], additionalProperties: false } } },
  { type: "function", function: { name: "create_red_zone", description: `Create a red zone like the Haiti border one: alert when a vehicle enters and automatic engine stop when it slows to ${20} km/h inside. It starts INACTIVE and only works after the customer confirms with the PIN.`, parameters: { type: "object", properties: { place: { type: "string", description: "City, neighbourhood, address or place, with state or country when ambiguous (or a short name when lat/lng are given)" }, lat: { type: "number", description: "Optional center latitude, e.g. a vehicle's current position from get_vehicle" }, lng: { type: "number", description: "Optional center longitude" }, radius_km: { type: "number", description: `Optional radius around the place in km (max ${200}). Omit to use the whole area of a city/neighbourhood/state.` }, device_ids: { type: "array", items: { type: "integer" }, description: "Vehicles it applies to; empty or omitted = all the customer's vehicles" }, name: { type: "string", description: "Optional short name" } }, required: ["place"], additionalProperties: false } } },
  { type: "function", function: { name: "list_red_zones", description: "List the customer's red zones (active or waiting for PIN).", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "activate_red_zone", description: "Ask the PIN to activate an inactive red zone.", parameters: { type: "object", properties: { zone_id: { type: "string" } }, required: ["zone_id"], additionalProperties: false } } },
  { type: "function", function: { name: "delete_red_zone", description: "Delete one of the customer's red zones.", parameters: { type: "object", properties: { zone_id: { type: "string" } }, required: ["zone_id"], additionalProperties: false } } },
  { type: "function", function: { name: "request_engine_command", description: "Prepare an engine stop or resume. It does NOT execute: the customer must confirm with their PIN in the app/web.", parameters: { type: "object", properties: { device_id: { type: "integer" }, command: { type: "string", enum: ["engine_stop", "engine_resume"] } }, required: ["device_id", "command"], additionalProperties: false } } },
];

function localNow(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "America/Santo_Domingo" }).slice(0, 16);
}

const ADMIN_RULE = "\nYou are talking to the platform OWNER (administrator) from his own number. He can ask about any client or vehicle on the whole platform (list_vehicles and get_vehicle cover every account) and change accounts: use find_clients and client_vehicles to look up, set_client_active and extend_membership to change, then say exactly what changed. Engine commands still need his PIN. Never delete devices or accounts.";

function greetRule(greet: string | null | undefined, lang: Lang, askName = false): string {
  if (greet === undefined || greet === null) return "";
  if (askName) return `This is the first message of the conversation and the customer's name is missing on their account: start with "${lang === "en" ? "Hi" : "Hola"}", ask their first and last name before anything else, and call save_customer_name when they tell you. Then help with what they asked.`;
  const hello = lang === "en" ? `Hi${greet ? ` ${greet}` : ""}` : `Hola${greet ? ` ${greet}` : ""}`;
  return `This is the first message of the conversation: start your reply with "${hello}". Unless the customer already named a vehicle, you MUST call list_vehicles first. With one vehicle, give its details right away. With 2 to 6, ask which one they want to know about, naming every one by make plus color or type (e.g. "¿De cuál de tus vehículos quieres saber: el Toyota, la Honda negra o el motor?"). With more than 6, say how many they have and ask them to tell you the name, plate or make.`;
}

function systemPrompt(assistantName: string, companyName: string, lang: Lang, deviceId: number | null, channel: Channel, spoken = false, greet?: string | null, askName = false): string {
  return [
    greetRule(greet, lang, askName),
    `You are "${assistantName}", the vehicle tracking assistant of ${companyName}. Reply in ${lang === "en" ? "English" : "Spanish (Dominican Republic, tú)"}.`,
    `Current local time (America/Santo_Domingo): ${localNow()}.`,
    "You only know the customer's own vehicles, through the tools. Never invent locations, speeds or data; if a tool fails, say so.",
    "Be brief and concrete (2-4 short sentences). Include the address, speed, whether the ignition is on/off when known and how long ago the last report was.",
    "When get_vehicle gives inside_zone (the customer's own geofence), say first that it is inside that zone, e.g. 'está dentro de la zona Casa'. Otherwise, when inside_place is given, the vehicle is really inside that mapped place: say it, e.g. 'está dentro de la escuela X', 'en el parqueo de la plaza Y' (inside_kind parqueo inside inside_of), 'dentro del parque Z'. Never say a vehicle is inside a place only because of location.near: near is a nearby point, so say 'a N metros de …' (only when near_meters is 30 or less you may say 'en …'). After the zone or place, still give the street and city.",
    "Say where a vehicle is with get_vehicle's location: street, neighbourhood or city, state, and \"near <near>\" with the distance when near is given. When location.near is given, say what kind of place it is (near_kind) and its street, e.g. 'a 200 metros de la estación de combustible Shell de la Avenida Duarte' or 'en el parqueo de la Plaza Las Américas'. To send a location by WhatsApp use send_location_whatsapp (only to the customer's own linked WhatsApp). Never read latitude/longitude to the customer unless location and address are both unknown. Say how long ago it reported with last_report_ago (never a raw count of minutes).",
    spoken || channel === "alexa"
      ? "Spoken answer: no GPS device status line. Mention battery, signal or power only when asked or when something is wrong (not connected to the vehicle power, low battery, engine blocked). Never say a value is unavailable: just skip unknown values (ignition, satellites, etc.)."
      : "When you describe one vehicle, add one short line with its GPS device status from gps_device: battery %, GSM signal (x/4), satellites, whether it is connected to the vehicle power and whether the engine is blocked. Say \"no disponible\" for missing values; never invent them. If it is not connected to the vehicle power, point it out.",
    "When several vehicles match, ask which one. If the customer has only one vehicle, use it.",
    "Alerts: when the customer asks to be told when a vehicle moves, goes over a speed or stays stopped some minutes, use create_alert (one call per vehicle and alert). Speeds are in km/h; if they say mph, convert.",
    "When the membership or the SIM data plan is expired (check_service) or the customer wants to renew or pay, call membership_payment_link and send exactly its payment_url. Never write or invent a payment link yourself: if the tool returns an error, say the team will send the link.",
    "New device: when the customer wants to add/activate a GPS or sends a photo with an IMEI, confirm the IMEI, ask the model (GT06 or SinoTrack) and a name for the vehicle if missing, then call activate_device and send its SMS instructions and card_url.",
    channel === "whatsapp" ? "When you ask the customer to pick one of 2 to 10 choices (which vehicle, yes/cancel for an owner confirmation), end the reply with a last line 'OPCIONES: choice 1 | choice 2 | …' (each choice at most 24 characters, e.g. the vehicle name). It becomes tap buttons; do not use it otherwise." : "",
    "Never delete vehicles or devices. The customer cannot change their email or phone number by chat or voice: tell them to change it in the platform or with support.",
    "When the customer asks why a vehicle is not updating, is offline or does not move on the map, call check_service. If problems include sim_data_plan_expired, sim_data_used_up, membership_expired or account_expired_or_suspended, say it plainly, e.g. 'El plan de datos de tu GPS está vencido; debes renovar tu membresía en la plataforma.' If none_found, explain with gps_device (not connected to power, no GSM signal, time since last contact) and suggest checking the power or that it may be where there is no coverage. Never invent a cause.",
    "To know which vehicles are in a city, state or country, use vehicles_in_place; give the total and name them (on voice, name at most 5 and say how many more).",
    "Customers may refer to a vehicle by its nickname, color, make, model or type (e.g. 'la jeepeta', 'el carro rojo', 'el Toyota'): pass those words as the list_vehicles search, and mention the nickname when you answer.",
    "Street View images are from Google and are not live; the location and speed are live.",
    "Engine stop/resume: only when the customer asks, and only through request_engine_command. Never say it was executed: tell the customer to confirm with their PIN. If the vehicle is moving, warn that stopping it can be dangerous. Do not offer engine commands unprompted.",
    channel === "whatsapp" && spoken ? "This is a WhatsApp voice note: your reply is read aloud as audio. 1-3 short sentences, no links, no lists, no markdown, no emojis; say numbers naturally. Mention only the GPS device values that are known and only battery/signal when asked or when something is wrong. To confirm an engine order the customer replies here with their PIN (never say app/web)."
      : channel === "whatsapp" ? "This is WhatsApp: plain text, include links as plain URLs. To confirm an engine order the customer replies here with their PIN (never say app/web)."
      : channel === "alexa" ? "This is a voice answer spoken by Alexa: 1-3 short sentences, no links, no lists, no markdown, no emojis; say numbers naturally. Mention only the GPS device values that are known (skip the unavailable ones) and only battery/signal when asked or when something is wrong. Engine stop/resume is not available by voice: if asked, only say it must be done in the app or web with the PIN; do not ask follow-up questions about it."
      : "The app/web shows buttons for map, Street View and history, so you do not need to paste links.",
    "Red zones (zona roja): when the customer asks for one, use create_red_zone (find the vehicles first with list_vehicles if they name some). For a zone around where a vehicle is now, or around coordinates, pass lat/lng (from get_vehicle) with radius_km (1 km if they do not say). Explain it alerts on entry and stops the engine when the vehicle slows to 20 km/h inside, and that it only turns on after the PIN confirmation (never say it is active before that). On voice it stays inactive: tell them to activate it in the app, web or WhatsApp.",
    "Do not answer questions unrelated to the customer's vehicles or GPS tracking; politely redirect.",
    deviceId ? `The vehicle currently open on screen has device_id ${deviceId}; "it" refers to that vehicle.` : "",
    `Always answer in ${lang === "en" ? "English" : "Spanish"}, even when the tool data or the question is in another language.`,
  ].filter(Boolean).join("\n");
}

type Provider = "openai" | "gemini";

async function llm(provider: Provider, model: string, messages: Msg[], tools: typeof TOOLS, effort: "minimal" | "low") {
  const gemini = provider === "gemini";
  const key = gemini ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY;
  if (!key) throw new Error(`${gemini ? "GEMINI" : "OPENAI"}_API_KEY no configurada`);
  const url = gemini ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" : "https://api.openai.com/v1/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: gemini ? process.env.GEMINI_MODEL || "gemini-3-flash-preview" : model, messages, tools, tool_choice: "auto", reasoning_effort: effort }),
    signal: AbortSignal.timeout(45_000),
  });
  const data = await res.json().catch(() => ({}));
  const error = Array.isArray(data) ? data[0]?.error : data?.error;
  if (!res.ok) throw new Error(`${gemini ? "Gemini" : "OpenAI"} ${res.status}: ${error?.message ?? "error"}`);
  return data as { choices: { message: Msg }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
}

function minutesAgo(ts: number): number | null {
  return ts ? Math.max(0, Math.round((Date.now() / 1000 - ts) / 60)) : null;
}

export function timeAgo(minutes: number | null, lang: Lang): string | null {
  if (minutes === null) return null;
  const unit = (n: number, es: string, en: string) => `${n} ${t(lang, es, en)}${n === 1 ? "" : lang === "en" ? "s" : es.endsWith("a") || es.endsWith("o") ? "s" : "es"}`;
  if (minutes < 60) return unit(minutes, "minuto", "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${unit(hours, "hora", "hour")} ${t(lang, "y", "and")} ${unit(minutes % 60, "minuto", "minute")}` : unit(hours, "hora", "hour");
  const days = Math.floor(hours / 24);
  return days < 60 ? unit(days, "día", "day") : unit(Math.floor(days / 30), "mes", "month");
}

async function deviceInfo(deviceId: number) {
  const s = (await deviceStatuses([deviceId]).catch(() => []))[0];
  if (!s) return "not available";
  return {
    battery_percent: s.battery ?? "not available",
    gsm_signal_bars: s.signal === null ? "not available" : `${s.signal}/4`,
    satellites: s.satellites ?? "not available",
    connected_to_vehicle_power: s.charging ?? "not available",
    engine_blocked_by_relay: s.blocked ?? "not available",
    vehicle_voltage: s.voltage ?? "not available",
    minutes_since_last_contact: s.lastReport ? Math.round((Date.now() - s.lastReport.getTime()) / 60_000) : "never",
  };
}

// Name on the customer's tracking account (GPSWOX client form); null when missing.
export async function customerName(userId: number): Promise<{ first: string; last: string } | null> {
  return withGpswoxDb(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT c.first_name, c.last_name FROM users u LEFT JOIN clients c ON c.id = u.client_id WHERE u.id = ?", [userId]);
    const first = String(rows[0]?.first_name ?? "").trim();
    return first ? { first, last: String(rows[0]?.last_name ?? "").trim() } : null;
  });
}

// Fills a missing name only; never overwrites one that is on file, and keeps a surname already there.
async function saveCustomerName(userId: number, first: string, last: string): Promise<boolean> {
  return withGpswoxDb(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT c.id AS client, c.first_name FROM users u LEFT JOIN clients c ON c.id = u.client_id WHERE u.id = ?", [userId]);
    if (!rows[0] || String(rows[0].first_name ?? "").trim()) return false;
    if (rows[0].client) {
      await conn.query("UPDATE clients SET first_name = ?, last_name = COALESCE(NULLIF(?, ''), last_name), updated_at = NOW() WHERE id = ?", [first, last, rows[0].client]);
    } else {
      const [res] = await conn.query("INSERT INTO clients (first_name, last_name, personal_code, birth_date, address, comment, created_at, updated_at) VALUES (?, ?, '', '', '', '', NOW(), NOW())", [first, last]);
      await conn.query("UPDATE users SET client_id = ? WHERE id = ?", [(res as { insertId: number }).insertId, userId]);
    }
    return true;
  });
}

// Account changes run only after the owner confirmed that exact action (client data the model reads cannot trigger them).
// The change runs only on the owner's next turn, when his own message is a "sí" to that same pending action.
const adminPending = new Map<number, { key: string; until: number }>();
const YES_RE = /^\s*(s[ií]|si,|confirmo|confirmado|dale|ok|okay|yes|hazlo|procede)\b/i;
function ownerApproved(userId: number, key: string, ownerMessage: string): boolean {
  const p = adminPending.get(userId);
  if (p && p.key === key && p.until > Date.now() && YES_RE.test(ownerMessage)) {
    adminPending.delete(userId);
    return true;
  }
  adminPending.set(userId, { key, until: Date.now() + 5 * 60_000 });
  return false;
}
const needsConfirmation = (action: string) => ({ status: "needs_owner_confirmation", action, instruction: "Ask the owner to confirm this exact action with yes; when he says yes, call the tool again with the same values." });

// The owner's own WhatsApp number: read any client account and make account changes.
function adminTools(userId: number, ownerMessage: string): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
  const day = (col: string) => `IF(${col} > '2000-01-01', DATE_FORMAT(${col}, '%Y-%m-%d'), NULL)`;
  const fullName = "TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, '')))";
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
            WHERE u.email LIKE ? OR ${fullName} LIKE ? ${digits.length >= 7 ? "OR REGEXP_REPLACE(u.phone_number, '[^0-9]', '') LIKE ?" : ""}
            ORDER BY u.id LIMIT 10`,
          [`%${q}%`, `%${q}%`, ...(digits.length >= 7 ? [`%${digits.slice(-7)}%`] : [])],
        );
        return { clients: rows.map((r) => ({ user_id: r.id, email: r.email, phone: r.phone || null, name: r.name || null, active: !!r.active, account_expires: r.account_expires, devices: Number(r.devices) })) };
      });
    },
    client_vehicles: async ({ user_id }) =>
      withGpswoxDb(async (conn) => {
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT d.id, d.name, d.plate_number AS plate, ${day("d.expiration_date")} AS membership_expires, DATE_FORMAT(t.server_time, '%Y-%m-%dT%H:%i:%sZ') AS reported
             FROM user_device_pivot p JOIN devices d ON d.id = p.device_id AND d.deleted = 0 LEFT JOIN traccar_devices t ON t.id = d.traccar_device_id
            WHERE p.user_id = ? ORDER BY d.name LIMIT 60`,
          [Number(user_id)],
        );
        return { vehicles: rows.map((r) => ({ device_id: r.id, name: r.name, plate: r.plate || null, membership_expires: r.membership_expires, minutes_since_last_report: r.reported ? Math.round((Date.now() - new Date(String(r.reported)).getTime()) / 60_000) : "never" })) };
      }),
    set_client_active: async ({ email, active }) => {
      const mail = String(email ?? "").trim().toLowerCase();
      const { setUserActive, userIdByEmail } = await import("../gpswox");
      if (!mail || !(await userIdByEmail(mail).catch(() => null))) return { error: "No client account with that email" };
      const action = `${active === true ? "Activate" : "Suspend"} the account ${mail}`;
      if (!ownerApproved(userId, action, ownerMessage)) return needsConfirmation(action);
      // A white-label client is blocked/unblocked like the company panel does, so the panel shows "Desbloquear".
      const client = await prisma.endClient.findFirst({ where: { email: mail, goneAt: null }, include: { company: true } });
      if (client) {
        const { blockClient, unblockClient } = await import("../clients");
        if (active !== true) await blockClient(client.company, client, "manual");
        else if (!(await unblockClient(client))) return { error: "The client is past its paid-until date: register a payment or a new date in the company panel first" };
      } else await setUserActive(mail, active === true);
      return { status: active === true ? "activated" : "suspended", email: mail };
    },
    extend_membership: async ({ device_id, months }) => {
      const n = Number(months);
      if (!Number.isInteger(n) || n < 1 || n > 36) return { error: "Months must be between 1 and 36" };
      const action = `Extend the membership of device ${Number(device_id)} by ${n} months`;
      if (!ownerApproved(userId, action, ownerMessage)) return needsConfirmation(action);
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
  };
}

// Why a vehicle stopped updating: device membership, account and SIM plan expiry (GPSWOX + our SIM sync).
async function serviceStatus(userId: number, deviceId: number) {
  const day = (col: string) => `IF(${col} > '2000-01-01', DATE_FORMAT(${col}, '%Y-%m-%d'), NULL)`;
  const [row, sim] = await Promise.all([
    withGpswoxDb(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT ${day("d.expiration_date")} AS device_exp, ${day("d.sim_expiration_date")} AS sim_exp, ${day("u.subscription_expiration")} AS account_exp, u.active
           FROM devices d JOIN users u ON u.id = ? WHERE d.id = ?`,
        [userId, deviceId],
      );
      return rows[0] ?? null;
    }).catch(() => null),
    prisma.simCard.findFirst({ where: { deviceId, goneAt: null }, orderBy: { lastSyncAt: "desc" } }).catch(() => null),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const past = (d: string | null | undefined) => !!d && d < today;
  const simExp = sim?.expiresAt ? sim.expiresAt.toISOString().slice(0, 10) : (row?.sim_exp ?? null);
  const simDown = sim ? sim.status === 3 || sim.status === 5 || past(simExp) : past(simExp);
  const usedUp = !!sim && sim.totalMb > 0 && sim.usedMb >= sim.totalMb;
  const problems = [
    past(row?.device_exp) && "membership_expired",
    (past(row?.account_exp) || row?.active === 0) && "account_expired_or_suspended",
    simDown && "sim_data_plan_expired",
    usedUp && "sim_data_used_up",
  ].filter(Boolean);
  return {
    membership_expires: row?.device_exp ?? "not set",
    account_expires: row?.account_exp ?? "not set",
    sim: sim ? { status: statusLabel(sim.status), plan_expires: simExp ?? "unknown", data_used_mb: Math.round(sim.usedMb), data_total_mb: Math.round(sim.totalMb) } : simExp ? { plan_expires: simExp } : "not registered",
    problems: problems.length ? problems : ["none_found"],
  };
}

// Named area the vehicle is inside: the customer's own geofence first, then a mapped place outline.
async function whereInside(userId: number, v: gps.Vehicle, lang: Lang) {
  const [zone, area] = await Promise.all([zoneAt(userId, v.id, v.lat, v.lng), mapAreaAt(v.lat, v.lng, lang)]);
  return { inside_zone: zone, inside_place: zone ? null : area };
}

// Read-only vehicle tools, shared by the chat engine and the MCP connector (Gemini).
// Owner mode: every vehicle on the platform, not only the owner's own account (location from the last GPS report).
async function withPlatform(own: gps.Vehicle[]): Promise<gps.Vehicle[]> {
  const ids = new Set(own.map((v) => v.id));
  const rows = await withGpswoxDb(async (conn) => {
    const [r] = await conn.query<RowDataPacket[]>(
      `SELECT d.id, d.name, d.plate_number AS plate, t.lastValidLatitude AS lat, t.lastValidLongitude AS lng, t.speed, DATE_FORMAT(t.server_time, '%Y-%m-%dT%H:%i:%sZ') AS reported
         FROM devices d LEFT JOIN traccar_devices t ON t.id = d.traccar_device_id WHERE d.deleted = 0`,
    );
    return r;
  }).catch((): RowDataPacket[] => []);
  const others = rows.filter((r) => !ids.has(Number(r.id))).map((r): gps.Vehicle => {
    const ts = r.reported ? Math.floor(Date.parse(String(r.reported)) / 1000) : 0;
    return {
      id: Number(r.id), name: String(r.name ?? `#${r.id}`), plate: r.plate || null, online: ts && Date.now() / 1000 - ts < 600 ? "online" : "offline",
      lat: Number(r.lat ?? 0), lng: Number(r.lng ?? 0), speed: Math.round(Number(r.speed ?? 0) * 1.852), speedUnit: "kph", engine: null,
      time: ts ? new Date(ts * 1000).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" }) : "", timestamp: ts, address: null, stopDuration: null, group: null,
    };
  });
  return [...own, ...others];
}

export function readTools(user: AiUser, lang: Lang, addAction: (a: AiAction) => void = () => {}, opts: { allVehicles?: boolean } = {}) {
  let cachedVehicles: gps.Vehicle[] | null = null;
  let ownIds = new Set<number>();
  const fleet = async () => {
    if (!cachedVehicles) {
      const own = await gps.vehicles(user.hash);
      ownIds = new Set(own.map((v) => v.id));
      cachedVehicles = opts.allVehicles ? await withPlatform(own) : own;
    }
    return cachedVehicles;
  };
  // Owner mode also sees other accounts' vehicles; account-bound actions only take the user's own ones.
  const isOwn = async (id: number) => (await fleet(), ownIds.has(Number(id)));
  const profileCache = new Map<number, VehicleProfile>();
  const profilesFor = async (ids: number[]) => {
    const missing = ids.filter((id) => !profileCache.has(id));
    if (missing.length) {
      const got = await vehicleProfiles(missing);
      for (const id of missing) profileCache.set(id, got.get(id) ?? { brand: null, model: null, year: null, color: null, type: null, nickname: null });
    }
    return profileCache;
  };
  const find = async (id: number) => (await fleet()).find((v) => v.id === Number(id)) ?? null;

  const tools: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
    list_vehicles: async ({ search }) => {
      const all = await fleet();
      const profiles = await profilesFor(all.map((v) => v.id));
      const list = all.filter((v) => matchesVehicle(String(search ?? ""), v, profiles.get(v.id)));
      return { total: list.length, vehicles: list.slice(0, 40).map((v) => ({ device_id: v.id, name: v.name, plate: v.plate, ...describe(profiles.get(v.id)), status: v.online, speed: `${v.speed} ${v.speedUnit}`, address: v.address })) };
    },
    get_vehicle: async ({ device_id }) => {
      const v = await find(Number(device_id));
      if (!v) return { error: "Vehicle not found among the customer's vehicles" };
      addAction({ type: "open_map", device_id: v.id, lat: v.lat, lng: v.lng, label: t(lang, "Ver en el mapa", "Show on map"), url: gps.mapUrl(v.lat, v.lng) });
      addAction({ type: "street_view", device_id: v.id, lat: v.lat, lng: v.lng, url: gps.streetViewUrl(v.lat, v.lng), label: t(lang, "Vista de la calle", "Street view") });
      return {
        device_id: v.id, name: v.name, plate: v.plate, ...describe((await profilesFor([v.id])).get(v.id)), status: v.online, speed: `${v.speed} ${v.speedUnit}`,
        ignition: v.engine === null ? "unknown" : v.engine ? "on" : "off", address: v.address ?? "unknown",
        location: (await reverseGeocode(v.lat, v.lng, lang)) ?? "unknown",
        ...(await whereInside(user.userId, v, lang)),
        lat: v.lat, lng: v.lng, last_report: v.time, minutes_since_last_report: minutesAgo(v.timestamp), last_report_ago: timeAgo(minutesAgo(v.timestamp), lang), stopped_for: v.stopDuration,
        map_url: gps.mapUrl(v.lat, v.lng), street_view_url: gps.streetViewUrl(v.lat, v.lng),
        gps_device: await deviceInfo(v.id),
      };
    },
    check_service: async ({ device_id }) => {
      const v = await find(Number(device_id));
      if (!v) return { error: "Vehicle not found among the customer's vehicles" };
      return { device_id: v.id, name: v.name, status: v.online, last_report_ago: timeAgo(minutesAgo(v.timestamp), lang), gps_device: await deviceInfo(v.id), ...(await serviceStatus(user.userId, v.id)) };
    },
    vehicles_in_place: async ({ place }) => {
      const found = await findPlace(String(place ?? ""), lang);
      if (!found) return { error: "Place not found; ask the customer for the city with its state or country" };
      const all = await fleet();
      const inside = all.filter((v) => insidePlace(v.lat, v.lng, found));
      const profiles = await profilesFor(inside.map((v) => v.id));
      return {
        place: found.name, kind: found.kind, total: inside.length, fleet_total: all.length,
        vehicles: inside.slice(0, 40).map((v) => ({ device_id: v.id, name: v.name, plate: v.plate, ...describe(profiles.get(v.id)), status: v.online, speed: `${v.speed} ${v.speedUnit}`, address: v.address, last_report_ago: timeAgo(minutesAgo(v.timestamp), lang) })),
      };
    },
    get_history: async ({ device_id, from, to }) => {
      const v = await find(Number(device_id));
      if (!v) return { error: "Vehicle not found among the customer's vehicles" };
      const re = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/;
      if (!re.test(String(from)) || !re.test(String(to))) return { error: "Dates must be YYYY-MM-DD HH:MM" };
      const span = new Date(String(to).replace(" ", "T")).getTime() - new Date(String(from).replace(" ", "T")).getTime();
      if (!(span > 0) || span > 31 * 864e5) return { error: "The range must be positive and at most 31 days" };
      const h = await gps.history(user.hash, v.id, String(from), String(to));
      addAction({ type: "open_history", device_id: v.id, from: String(from).replace(" ", "T"), to: String(to).replace(" ", "T"), label: t(lang, "Ver historial", "Show history") });
      return { device_id: v.id, name: v.name, ...h };
    },
  };
  return { tools, find, isOwn };
}

// Sends one vehicle's location to the customer's own WhatsApp (profile number + linked numbers). Used by the assistant and Google Home.
export async function sendLocationWhatsApp(user: AiUser, v: gps.Vehicle, lang: Lang, onlyTo?: string): Promise<{ status: "sent"; to: string } | { error: string }> {
  const { DIRECT_WA, queueWa, waNumber } = await import("../wa");
  const { sendWhatsApp } = await import("../notify");
  const { userPhone } = await import("../gpswox");
  const brandId = user.company && user.company.status !== "CANCELED" ? user.company.id : null;
  const targets = new Map<string, string>();
  const profile = waNumber(await userPhone(user.userId).catch(() => null));
  if (profile) targets.set(profile, brandId ?? DIRECT_WA);
  for (const l of await prisma.waLink.findMany({ where: { gpswoxUserId: user.userId } })) if (!targets.has(l.phone)) targets.set(l.phone, l.companyId);
  if (onlyTo) {
    const { OWNER_WA } = await import("../wa");
    const only = waNumber(onlyTo);
    targets.clear();
    if (only) targets.set(only, OWNER_WA);
  }
  if (!targets.size) return { error: "This account has no WhatsApp number: tell the customer to add their WhatsApp number (with country code) in their profile on the tracking platform, then ask again." };
  const place = await reverseGeocode(v.lat, v.lng, lang);
  const where = place ? [place.street, place.neighbourhood, place.city, place.state].filter(Boolean).join(", ") : v.address ?? `${v.lat}, ${v.lng}`;
  const { inside_zone, inside_place } = await whereInside(user.userId, v, lang);
  const insideName = inside_place && (inside_place.inside ? [inside_place.inside_kind, inside_place.inside].filter(Boolean).join(" ") : null);
  const insideOf = inside_place?.inside_of ? [inside_place.inside_of_kind, inside_place.inside_of].filter(Boolean).join(" ") : null;
  const inside = inside_zone
    ? `${t(lang, "Dentro de la zona", "Inside zone")}: ${inside_zone}`
    : insideName || insideOf
      ? `${t(lang, "Dentro de", "Inside")}: ${[insideName ?? inside_place?.inside_kind, insideOf].filter(Boolean).join(t(lang, " de ", " at "))}`
      : "";
  const near = place?.near ? `${t(lang, "Cerca de", "Near")}: ${[place.nearKind, place.near].filter(Boolean).join(" ")}${place.nearStreet ? ` (${place.nearStreet})` : ""}, ${place.nearMeters} m` : "";
  const ago = timeAgo(minutesAgo(v.timestamp), lang);
  const text = [`*${v.name}${v.plate ? ` (${v.plate})` : ""}*`, `${t(lang, "Ubicación", "Location")}: ${where}`, inside, near, `${t(lang, "Velocidad", "Speed")}: ${v.speed} ${v.speedUnit}`, ago ? `${t(lang, "Último reporte", "Last report")}: ${t(lang, "hace", "")} ${ago}${t(lang, "", " ago")}`.replace(/\s+/g, " ") : "", gps.mapUrl(v.lat, v.lng)].filter(Boolean).join("\n");
  const sentTo: string[] = [];
  for (const [phone, companyId] of targets) {
    const viaBrand = companyId !== DIRECT_WA && (await queueWa(companyId, phone, text).catch(() => false));
    const ok = viaBrand || (await sendWhatsApp(phone, text).catch(() => ({ ok: false }))).ok;
    if (ok) sentTo.push(`…${phone.slice(-4)}`);
  }
  return sentTo.length ? { status: "sent", to: `WhatsApp ending in ${sentTo.join(", ")}` } : { error: "The WhatsApp message could not be sent now (WhatsApp not connected). Tell the customer to try later." };
}

export async function chat(input: { user: AiUser; conversationId: string | null; message: string; lang: Lang; deviceId: number | null; channel: Channel; spoken?: boolean; greet?: string | null; askName?: boolean; admin?: boolean }): Promise<ChatResult> {
  const { user, lang, channel } = input;
  const setting = await aiSetting();
  const config = await assistantConfig(user, lang);
  let conversation = input.conversationId ? await prisma.aiConversation.findUnique({ where: { id: input.conversationId } }) : null;
  if (conversation && conversation.gpswoxUserId !== user.userId) conversation = null;
  const past: Msg[] = conversation ? (JSON.parse(conversation.messages) as Msg[]).slice(-MAX_HISTORY) : [];

  const actions: AiAction[] = [];
  let confirm: PendingConfirm | null = null;
  const addAction = (a: AiAction) => {
    if (!actions.some((x) => x.type === a.type && x.device_id === a.device_id)) actions.push(a);
  };
  const { tools: readOnly, find, isOwn } = readTools(user, lang, addAction, { allVehicles: input.admin });
  // On WhatsApp a customer without a PIN creates it by replying to the confirmation.
  const pinReady = async () => channel === "whatsapp" || (await hasPin(user.userId));
  const pinStatus = async () => ((await hasPin(user.userId)) ? "awaiting_pin_confirmation" : "awaiting_new_pin: the customer has no PIN yet; tell them to reply with a new PIN of 4 to 6 digits, it is saved and confirms this order");
  const tools: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
    ...readOnly,
    request_engine_command: async ({ device_id, command }) => {
      const v = await find(Number(device_id));
      if (!v) return { error: "Vehicle not found among the customer's vehicles" };
      const cmd = command === "engine_resume" ? "engine_resume" : "engine_stop";
      if (!(await gps.supportsCommand(user.hash, v.id, cmd))) return { error: "This vehicle's GPS does not support this command" };
      if (!(await pinReady())) return { error: "The customer has no PIN yet. Tell them to create one in the assistant settings (PIN option) and ask again." };
      confirm = await createConfirm(user, v.id, v.name, cmd);
      return { status: await pinStatus(), device_id: v.id, name: v.name, plate: v.plate, current_speed: `${v.speed} ${v.speedUnit}` };
    },
  };

  const voice = channel === "alexa";
  const zoneInfo = (z: { id: string; name: string; radiusM: number | null; deviceIds: string; active: boolean; cut: boolean }) => ({
    zone_id: z.id, name: z.name, shape: zoneShape(z, lang), vehicles: zoneDevices(z).length || "all", active: z.active, engine_stop_at_kmh: z.cut ? CUT_SPEED_KMH : null,
  });
  tools.create_red_zone = async ({ place, lat, lng, radius_km, device_ids, name }) => {
    const ids = Array.isArray(device_ids) ? device_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
    for (const id of ids) if (!(await find(id))) return { error: `Vehicle ${id} not found among the customer's vehicles` };
    const radius = Number(radius_km);
    if (radius_km !== undefined && !(radius > 0 && radius <= MAX_ZONE_KM)) return { error: `radius_km must be between 0.1 and ${MAX_ZONE_KM}` };
    const point = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat !== undefined && lng !== undefined ? { lat: Number(lat), lng: Number(lng) } : null;
    const zone = await createRedZone(user.userId, { place: String(place ?? ""), point, radiusKm: radius_km === undefined ? null : radius, deviceIds: ids, name: name ? String(name) : null }, lang);
    if ("error" in zone) return zone;
    if (voice) return { ...zoneInfo(zone), status: "created_inactive", how_to_activate: "By voice it cannot be activated: tell the customer to say in the app, web or WhatsApp 'activa la zona roja " + zone.name + "' and confirm with the PIN." };
    if (!(await pinReady())) return { ...zoneInfo(zone), status: "created_inactive", error: "The customer has no PIN yet. Tell them to create one in the assistant settings (PIN option) and then ask to activate the zone." };
    confirm = await createZoneConfirm(user, zone.id, zone.name);
    return { ...zoneInfo(zone), status: await pinStatus() };
  };
  tools.list_red_zones = async () => ({ zones: (await listRedZones(user.userId)).map(zoneInfo) });
  tools.activate_red_zone = async ({ zone_id }) => {
    const zone = (await listRedZones(user.userId)).find((z) => z.id === String(zone_id));
    if (!zone) return { error: "Red zone not found" };
    if (zone.active) return { ...zoneInfo(zone), status: "already_active" };
    if (!(await pinReady())) return { error: "The customer has no PIN yet. Tell them to create one in the assistant settings (PIN option) and ask again." };
    confirm = await createZoneConfirm(user, zone.id, zone.name);
    return { ...zoneInfo(zone), status: await pinStatus() };
  };
  tools.delete_red_zone = async ({ zone_id }) => ((await deleteRedZone(user, String(zone_id))) ? { status: "deleted" } : { error: "Red zone not found" });
  tools.create_alert = async ({ device_id, kind, speed_kmh, minutes }) => {
    const v = await find(Number(device_id));
    if (!v) return { error: "Vehicle not found among the customer's vehicles" };
    const k = kind === "overspeed" || kind === "stop" ? kind : "movement";
    const value = k === "overspeed" ? Number(speed_kmh) : k === "stop" ? Number(minutes) : 0;
    if (k === "overspeed" && !(value >= 5 && value <= 250)) return { error: "Ask the speed limit in km/h (5 to 250)" };
    if (k === "stop" && !(value >= 1 && value <= 1440)) return { error: "Ask how many minutes stopped (1 to 1440)" };
    const label = k === "movement" ? t(lang, "En movimiento", "Moving") : k === "overspeed" ? t(lang, `Más de ${value} km/h`, `Over ${value} km/h`) : t(lang, `Detenido más de ${value} min`, `Stopped over ${value} min`);
    const { alertKey } = await import("../wa");
    const { appUrl } = await import("../config");
    const hook = `${appUrl()}/api/gpswox/alert?u=${user.userId}&k=${alertKey(user.userId)}`;
    const r = await gps.addAlert(user.hash, v.id, k, `${label} - ${v.name}`.slice(0, 90), value, hook);
    return r.ok ? { status: "created", vehicle: v.name, alert: label, delivery: "app and WhatsApp" } : { error: `Could not create the alert: ${r.error}` };
  };
  tools.membership_payment_link = async ({ device_id }) => {
    const v = await find(Number(device_id));
    if (!v) return { error: "Vehicle not found among the customer's vehicles" };
    const card = await prisma.simCard.findFirst({ where: { deviceId: v.id, goneAt: null }, orderBy: { lastSyncAt: "desc" } });
    if (!card) return { error: "No renewal price on file for this vehicle. Do not give any link: tell the customer the team will send the payment link" };
    const { ensureRenewal, renewalGhlUrl, REACTIVATION_NOTE } = await import("../sim/notify");
    const renewal = await ensureRenewal(card);
    if (!renewal) return { error: "No renewal price on file for this vehicle. Do not give any link: tell the customer the team will send the payment link" };
    const name = await customerName(user.userId).catch(() => null);
    const url = await renewalGhlUrl(renewal, card, { name: name ? `${name.first} ${name.last}`.trim() : user.email, email: user.email, phone: card.ownerPhone }).catch(() => null);
    if (!url) return { error: "The payment link could not be created now. Do not give any link: tell the customer the team will send it" };
    const { formatMoney } = await import("../format");
    return { vehicle: v.name, amount: formatMoney(renewal.amountCents, renewal.currency), includes_reactivation: renewal.reactivation, payment_url: url, after_payment: `The membership renews for 1 year as soon as the payment is confirmed. ${renewal.reactivation ? REACTIVATION_NOTE : ""}`.trim() };
  };
  if (input.admin) Object.assign(tools, adminTools(user.userId, input.message));
  if (channel === "whatsapp") {
    tools.activate_device = async ({ imei, model, name }) => {
      const code = String(imei ?? "").replace(/\D/g, "");
      if (!/^\d{10,17}$/.test(code)) return { error: "Ask the customer for a clear photo of the IMEI or ID label (10 to 17 digits)" };
      const act = await import("../activation");
      const m = String(model ?? "").toLowerCase();
      if (!act.isModel(m)) return { error: "Ask which model it is: GT06 or SinoTrack" };
      const { deviceIdByImei } = await import("../gpswox");
      if (await deviceIdByImei(code).catch(() => null)) return { error: "That IMEI is already registered on the platform: tell the customer the team will check it" };
      const avail = await act.activationAvailable(user.userId);
      if (!avail.ok) return { error: "Activation by WhatsApp is not available for this account: tell the customer the team will help" };
      const url = await act.startActivation({ gpswoxUserId: user.userId, email: user.email, companyId: avail.companyId, model: m, imei: code, name: String(name ?? "").trim().slice(0, 60) || `GPS ${code.slice(-4)}` }).catch(() => null);
      if (!url) return { error: "The activation could not start now: tell the customer the team will help" };
      const setting = await act.activationSetting();
      const total = act.offerTotal(setting);
      const { formatMoney } = await import("../format");
      const price = total > 0 ? `${formatMoney(total, setting.currency)} per year (${act.offerItems(setting).map((i) => i.label).join(" + ")}), renewed yearly on the card` : "no charge";
      return { status: "card_needed", imei: code, card_url: url, price, sms_instructions: act.instructionLines(m), note: `Tell the price and that it renews yearly, then send the SMS instructions and the card link. The first charge happens only after the device stays connected ${act.STABLE_HOURS} hours.` };
    };
    tools.save_customer_name = async ({ first_name, last_name }) => {
      const clean = (x: unknown) => String(x ?? "").replace(/[^\p{L}\s'.-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
      const first = clean(first_name);
      if (first.length < 2) return { error: "Ask the customer's name again" };
      const saved = await saveCustomerName(user.userId, first, clean(last_name)).catch(() => null);
      if (saved === null) return { error: "Could not save the name right now; continue helping the customer" };
      return saved ? { status: "saved" } : { status: "already_on_file" };
    };
  }
  tools.send_location_whatsapp = async ({ device_id }) => {
    const v = await find(Number(device_id));
    if (!v) return { error: "Vehicle not found among the customer's vehicles" };
    // Another account's vehicle in owner mode: only to the owner's own number.
    if (input.admin && !(await isOwn(v.id))) {
      const { BRAND } = await import("../config");
      return sendLocationWhatsApp(user, v, lang, BRAND.ownerWhatsApp);
    }
    return sendLocationWhatsApp(user, v, lang);
  };
  const VOICE_BLOCKED = ["request_engine_command", "activate_red_zone"];
  if (voice) for (const name of VOICE_BLOCKED) delete tools[name];
  const messages: Msg[] = [{ role: "system", content: systemPrompt(config.name, config.companyName, lang, input.deviceId, channel, input.spoken, input.greet, input.askName) + (input.admin ? ADMIN_RULE : "") }, ...past, { role: "user", content: input.message }];
  // Remote channels (WhatsApp, Alexa) think with Gemini when configured; in-platform chat stays on OpenAI.
  let provider: Provider = (channel === "whatsapp" || channel === "alexa") && process.env.GEMINI_API_KEY ? "gemini" : "openai";
  let reply = "";
  let tokensIn = 0;
  let tokensOut = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const toolList = TOOLS.filter((x) => x.function.name in tools);
    const effort = voice ? "minimal" : "low";
    let data: Awaited<ReturnType<typeof llm>>;
    try {
      data = await llm(provider, setting.model, messages, toolList, effort);
    } catch (e) {
      if (provider === "openai") throw e;
      console.error("[ia] gemini failed, using OpenAI:", e instanceof Error ? e.message : e);
      provider = "openai";
      for (const m of messages) if (m.tool_calls) m.tool_calls = m.tool_calls.map(({ id, type, function: f }) => ({ id, type, function: f }));
      data = await llm(provider, setting.model, messages, toolList, effort);
    }
    tokensIn += data.usage?.prompt_tokens ?? 0;
    tokensOut += data.usage?.completion_tokens ?? 0;
    const msg = data.choices[0].message;
    if (!msg.tool_calls?.length) {
      reply = (msg.content ?? "").trim();
      break;
    }
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
    for (const call of msg.tool_calls) {
      let result: unknown;
      try {
        const fn = tools[call.function.name];
        result = fn ? await fn(JSON.parse(call.function.arguments || "{}")) : { error: "unknown tool" };
      } catch (e) {
        if (e instanceof gps.SessionError) throw e;
        result = { error: "GPS Link did not answer, try again later" };
        console.error("[ia] tool", call.function.name, e);
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  if (!reply) reply = t(lang, "No pude responder ahora. Intenta otra vez.", "I couldn't answer right now. Please try again.");

  const saved = [...past, { role: "user", content: input.message }, { role: "assistant", content: reply }].slice(-MAX_HISTORY * 2);
  const data = { messages: JSON.stringify(saved), turns: { increment: 1 }, tokensIn: { increment: tokensIn }, tokensOut: { increment: tokensOut } };
  const stored = conversation
    ? await prisma.aiConversation.update({ where: { id: conversation.id }, data })
    : await prisma.aiConversation.create({ data: { gpswoxUserId: user.userId, companyId: user.company?.id ?? null, channel, messages: data.messages, turns: 1, tokensIn, tokensOut } });
  return { conversation_id: stored.id, reply, actions, confirm };
}
