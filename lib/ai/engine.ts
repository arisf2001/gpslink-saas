import { prisma } from "../db";
import { aiSetting, assistantConfig, createConfirm, createZoneConfirm, hasPin, t, type AiUser, type Channel, type Lang, type PendingConfirm } from "./assistant";
import * as gps from "./gps";
import { findPlace, insidePlace, reverseGeocode } from "./geocode";
import { createRedZone, deleteRedZone, listRedZones, MAX_ZONE_KM, zoneDevices, zoneShape } from "../red-zones";
import { CUT_SPEED_KMH } from "../border-zones";
import { deviceStatuses } from "../device-status";
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

function systemPrompt(assistantName: string, companyName: string, lang: Lang, deviceId: number | null, channel: Channel): string {
  return [
    `You are "${assistantName}", the vehicle tracking assistant of ${companyName}. Reply in ${lang === "en" ? "English" : "Spanish (Dominican Republic, tú)"}.`,
    `Current local time (America/Santo_Domingo): ${localNow()}.`,
    "You only know the customer's own vehicles, through the tools. Never invent locations, speeds or data; if a tool fails, say so.",
    "Be brief and concrete (2-4 short sentences). Include the address, speed, whether the ignition is on/off when known and how long ago the last report was.",
    "Say where a vehicle is with get_vehicle's location: street, neighbourhood or city, state, and \"near <near>\" with the distance when near is given. When location.near is given, say what kind of place it is (near_kind) and its street, e.g. 'a 200 metros de la estación de combustible Shell de la Avenida Duarte' or 'en el parqueo de la Plaza Las Américas'. To send a location by WhatsApp use send_location_whatsapp (only to the customer's own linked WhatsApp). Never read latitude/longitude to the customer unless location and address are both unknown. Say how long ago it reported with last_report_ago (never a raw count of minutes).",
    "When you describe one vehicle, add one short line with its GPS device status from gps_device: battery %, GSM signal (x/4), satellites, whether it is connected to the vehicle power and whether the engine is blocked. Say \"no disponible\" for missing values; never invent them. If it is not connected to the vehicle power, point it out.",
    "When several vehicles match, ask which one. If the customer has only one vehicle, use it.",
    "To know which vehicles are in a city, state or country, use vehicles_in_place; give the total and name them (on voice, name at most 5 and say how many more).",
    "Customers may refer to a vehicle by its nickname, color, make, model or type (e.g. 'la jeepeta', 'el carro rojo', 'el Toyota'): pass those words as the list_vehicles search, and mention the nickname when you answer.",
    "Street View images are from Google and are not live; the location and speed are live.",
    "Engine stop/resume: only when the customer asks, and only through request_engine_command. Never say it was executed: tell the customer to confirm with their PIN. If the vehicle is moving, warn that stopping it can be dangerous. Do not offer engine commands unprompted.",
    channel === "whatsapp" ? "This is WhatsApp: plain text, include links as plain URLs. To confirm an engine order the customer replies here with their PIN (never say app/web)."
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

// Read-only vehicle tools, shared by the chat engine and the MCP connector (Gemini).
export function readTools(user: AiUser, lang: Lang, addAction: (a: AiAction) => void = () => {}) {
  let cachedVehicles: gps.Vehicle[] | null = null;
  const fleet = async () => (cachedVehicles ??= await gps.vehicles(user.hash));
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
        lat: v.lat, lng: v.lng, last_report: v.time, minutes_since_last_report: minutesAgo(v.timestamp), last_report_ago: timeAgo(minutesAgo(v.timestamp), lang), stopped_for: v.stopDuration,
        map_url: gps.mapUrl(v.lat, v.lng), street_view_url: gps.streetViewUrl(v.lat, v.lng),
        gps_device: await deviceInfo(v.id),
      };
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
  return { tools, find };
}

// Sends one vehicle's location to the customer's own WhatsApp (profile number + linked numbers). Used by the assistant and Google Home.
export async function sendLocationWhatsApp(user: AiUser, v: gps.Vehicle, lang: Lang): Promise<{ status: "sent"; to: string } | { error: string }> {
  const { DIRECT_WA, queueWa, waNumber } = await import("../wa");
  const { sendWhatsApp } = await import("../notify");
  const { userPhone } = await import("../gpswox");
  const brandId = user.company && user.company.status !== "CANCELED" ? user.company.id : null;
  const targets = new Map<string, string>();
  const profile = waNumber(await userPhone(user.userId).catch(() => null));
  if (profile) targets.set(profile, brandId ?? DIRECT_WA);
  for (const l of await prisma.waLink.findMany({ where: { gpswoxUserId: user.userId } })) if (!targets.has(l.phone)) targets.set(l.phone, l.companyId);
  if (!targets.size) return { error: "This account has no WhatsApp number: tell the customer to add their WhatsApp number (with country code) in their profile on the tracking platform, then ask again." };
  const place = await reverseGeocode(v.lat, v.lng, lang);
  const where = place ? [place.street, place.neighbourhood, place.city, place.state].filter(Boolean).join(", ") : v.address ?? `${v.lat}, ${v.lng}`;
  const near = place?.near ? `${t(lang, "Cerca de", "Near")}: ${[place.nearKind, place.near].filter(Boolean).join(" ")}${place.nearStreet ? ` (${place.nearStreet})` : ""}, ${place.nearMeters} m` : "";
  const ago = timeAgo(minutesAgo(v.timestamp), lang);
  const text = [`*${v.name}${v.plate ? ` (${v.plate})` : ""}*`, `${t(lang, "Ubicación", "Location")}: ${where}`, near, `${t(lang, "Velocidad", "Speed")}: ${v.speed} ${v.speedUnit}`, ago ? `${t(lang, "Último reporte", "Last report")}: ${t(lang, "hace", "")} ${ago}${t(lang, "", " ago")}`.replace(/\s+/g, " ") : "", gps.mapUrl(v.lat, v.lng)].filter(Boolean).join("\n");
  const sentTo: string[] = [];
  for (const [phone, companyId] of targets) {
    const viaBrand = companyId !== DIRECT_WA && (await queueWa(companyId, phone, text).catch(() => false));
    const ok = viaBrand || (await sendWhatsApp(phone, text).catch(() => ({ ok: false }))).ok;
    if (ok) sentTo.push(`…${phone.slice(-4)}`);
  }
  return sentTo.length ? { status: "sent", to: `WhatsApp ending in ${sentTo.join(", ")}` } : { error: "The WhatsApp message could not be sent now (WhatsApp not connected). Tell the customer to try later." };
}

export async function chat(input: { user: AiUser; conversationId: string | null; message: string; lang: Lang; deviceId: number | null; channel: Channel }): Promise<ChatResult> {
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
  const { tools: readOnly, find } = readTools(user, lang, addAction);
  const tools: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
    ...readOnly,
    request_engine_command: async ({ device_id, command }) => {
      const v = await find(Number(device_id));
      if (!v) return { error: "Vehicle not found among the customer's vehicles" };
      const cmd = command === "engine_resume" ? "engine_resume" : "engine_stop";
      if (!(await gps.supportsCommand(user.hash, v.id, cmd))) return { error: "This vehicle's GPS does not support this command" };
      if (!(await hasPin(user.userId))) return { error: "The customer has no PIN yet. Tell them to create one in the assistant settings (PIN option) and ask again." };
      confirm = await createConfirm(user, v.id, v.name, cmd);
      return { status: "awaiting_pin_confirmation", device_id: v.id, name: v.name, plate: v.plate, current_speed: `${v.speed} ${v.speedUnit}` };
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
    if (!(await hasPin(user.userId))) return { ...zoneInfo(zone), status: "created_inactive", error: "The customer has no PIN yet. Tell them to create one in the assistant settings (PIN option) and then ask to activate the zone." };
    confirm = await createZoneConfirm(user, zone.id, zone.name);
    return { ...zoneInfo(zone), status: "awaiting_pin_confirmation" };
  };
  tools.list_red_zones = async () => ({ zones: (await listRedZones(user.userId)).map(zoneInfo) });
  tools.activate_red_zone = async ({ zone_id }) => {
    const zone = (await listRedZones(user.userId)).find((z) => z.id === String(zone_id));
    if (!zone) return { error: "Red zone not found" };
    if (zone.active) return { ...zoneInfo(zone), status: "already_active" };
    if (!(await hasPin(user.userId))) return { error: "The customer has no PIN yet. Tell them to create one in the assistant settings (PIN option) and ask again." };
    confirm = await createZoneConfirm(user, zone.id, zone.name);
    return { ...zoneInfo(zone), status: "awaiting_pin_confirmation" };
  };
  tools.delete_red_zone = async ({ zone_id }) => ((await deleteRedZone(user, String(zone_id))) ? { status: "deleted" } : { error: "Red zone not found" });
  tools.send_location_whatsapp = async ({ device_id }) => {
    const v = await find(Number(device_id));
    if (!v) return { error: "Vehicle not found among the customer's vehicles" };
    return sendLocationWhatsApp(user, v, lang);
  };
  const VOICE_BLOCKED = ["request_engine_command", "activate_red_zone"];
  if (voice) for (const name of VOICE_BLOCKED) delete tools[name];
  const messages: Msg[] = [{ role: "system", content: systemPrompt(config.name, config.companyName, lang, input.deviceId, channel) }, ...past, { role: "user", content: input.message }];
  // Remote channels (WhatsApp, Alexa) think with Gemini when configured; in-platform chat stays on OpenAI.
  let provider: Provider = (channel === "whatsapp" || channel === "alexa") && process.env.GEMINI_API_KEY ? "gemini" : "openai";
  let reply = "";
  let tokensIn = 0;
  let tokensOut = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const toolList = voice ? TOOLS.filter((x) => !VOICE_BLOCKED.includes(x.function.name)) : TOOLS;
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
