import { prisma } from "../db";
import { aiSetting, assistantConfig, createConfirm, hasPin, t, type AiUser, type Channel, type Lang, type PendingConfirm } from "./assistant";
import * as gps from "./gps";

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
  { type: "function", function: { name: "list_vehicles", description: "List the customer's vehicles with status. Use it to find a vehicle by name or plate.", parameters: { type: "object", properties: { search: { type: "string", description: "Optional name or plate filter" } }, additionalProperties: false } } },
  { type: "function", function: { name: "get_vehicle", description: "Current location, address, speed, ignition and last report of one vehicle.", parameters: { type: "object", properties: { device_id: { type: "integer" } }, required: ["device_id"], additionalProperties: false } } },
  { type: "function", function: { name: "get_history", description: "Trips summary for a vehicle between two local datetimes (America/Santo_Domingo): distance, top speed, moving/stopped time and stops.", parameters: { type: "object", properties: { device_id: { type: "integer" }, from: { type: "string", description: "YYYY-MM-DD HH:MM" }, to: { type: "string", description: "YYYY-MM-DD HH:MM" } }, required: ["device_id", "from", "to"], additionalProperties: false } } },
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
    "When several vehicles match, ask which one. If the customer has only one vehicle, use it.",
    "Street View images are from Google and are not live; the location and speed are live.",
    "Engine stop/resume: only when the customer asks, and only through request_engine_command. Never say it was executed: tell the customer to confirm with their PIN. If the vehicle is moving, warn that stopping it can be dangerous. Do not offer engine commands unprompted.",
    channel === "whatsapp" ? "This is WhatsApp: plain text, include links as plain URLs." : "The app/web shows buttons for map, Street View and history, so you do not need to paste links.",
    "Do not answer questions unrelated to the customer's vehicles or GPS tracking; politely redirect.",
    deviceId ? `The vehicle currently open on screen has device_id ${deviceId}; "it" refers to that vehicle.` : "",
  ].filter(Boolean).join("\n");
}

async function openai(model: string, messages: Msg[]) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY no configurada");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, tools: TOOLS, tool_choice: "auto", reasoning_effort: "low" }),
    signal: AbortSignal.timeout(45_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${data?.error?.message ?? "error"}`);
  return data as { choices: { message: Msg }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
}

function minutesAgo(ts: number): number | null {
  return ts ? Math.max(0, Math.round((Date.now() / 1000 - ts) / 60)) : null;
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
  let cachedVehicles: gps.Vehicle[] | null = null;
  const fleet = async () => (cachedVehicles ??= await gps.vehicles(user.hash));
  const find = async (id: number) => (await fleet()).find((v) => v.id === Number(id)) ?? null;
  const addAction = (a: AiAction) => {
    if (!actions.some((x) => x.type === a.type && x.device_id === a.device_id)) actions.push(a);
  };

  const tools: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
    list_vehicles: async ({ search }) => {
      const q = String(search ?? "").toLowerCase().trim();
      const list = (await fleet()).filter((v) => !q || v.name.toLowerCase().includes(q) || (v.plate ?? "").toLowerCase().includes(q));
      return { total: list.length, vehicles: list.slice(0, 40).map((v) => ({ device_id: v.id, name: v.name, plate: v.plate, status: v.online, speed: `${v.speed} ${v.speedUnit}`, address: v.address })) };
    },
    get_vehicle: async ({ device_id }) => {
      const v = await find(Number(device_id));
      if (!v) return { error: "Vehicle not found among the customer's vehicles" };
      addAction({ type: "open_map", device_id: v.id, lat: v.lat, lng: v.lng, label: t(lang, "Ver en el mapa", "Show on map"), url: gps.mapUrl(v.lat, v.lng) });
      addAction({ type: "street_view", device_id: v.id, lat: v.lat, lng: v.lng, url: gps.streetViewUrl(v.lat, v.lng), label: t(lang, "Vista de la calle", "Street view") });
      return {
        device_id: v.id, name: v.name, plate: v.plate, status: v.online, speed: `${v.speed} ${v.speedUnit}`,
        ignition: v.engine === null ? "unknown" : v.engine ? "on" : "off", address: v.address ?? "unknown",
        lat: v.lat, lng: v.lng, last_report: v.time, minutes_since_last_report: minutesAgo(v.timestamp), stopped_for: v.stopDuration,
        map_url: gps.mapUrl(v.lat, v.lng), street_view_url: gps.streetViewUrl(v.lat, v.lng),
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

  const messages: Msg[] = [{ role: "system", content: systemPrompt(config.name, config.companyName, lang, input.deviceId, channel) }, ...past, { role: "user", content: input.message }];
  let reply = "";
  let tokensIn = 0;
  let tokensOut = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const data = await openai(setting.model, messages);
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
