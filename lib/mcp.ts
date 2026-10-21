import { assistantConfig, rateLimit, resolveUser } from "./ai/assistant";
import { readTools } from "./ai/engine";
import { SessionError } from "./ai/gps";
import { appUrl } from "./config";
import { userFromBearer } from "./oauth";

// Minimal MCP server (Streamable HTTP, JSON responses) so a customer can connect GPS Link to Gemini as a custom app.
// Read-only: vehicles, location/status and trip history. Engine commands are never exposed here.

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const TOOLS = [
  { name: "list_vehicles", title: "List vehicles", description: "List the customer's GPS-tracked vehicles with status, make, model, year, color, type and nickname. Use it to find a vehicle by name, plate, nickname, color, make, model or type.", inputSchema: { type: "object", properties: { search: { type: "string", description: "Optional filter: name, plate, nickname, color, make, model or type" } } }, annotations: { readOnlyHint: true } },
  { name: "get_vehicle", title: "Vehicle status", description: "Current location (address, map link), speed, ignition, last report and GPS device status (battery, GSM signal, satellites, power) of one vehicle.", inputSchema: { type: "object", properties: { device_id: { type: "integer" } }, required: ["device_id"] }, annotations: { readOnlyHint: true } },
  { name: "get_history", title: "Trip history", description: "Trips summary for a vehicle between two local datetimes (America/Santo_Domingo): distance, top speed, moving/stopped time and stops. Max 31 days.", inputSchema: { type: "object", properties: { device_id: { type: "integer" }, from: { type: "string", description: "YYYY-MM-DD HH:MM" }, to: { type: "string", description: "YYYY-MM-DD HH:MM" } }, required: ["device_id", "from", "to"] }, annotations: { readOnlyHint: true } },
];

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

export function resourceUrl(brand: string | null): string {
  return `${appUrl()}/mcp${brand ? `/${brand}` : ""}`;
}

function unauthorized(brand: string | null): Response {
  const meta = `${appUrl()}/.well-known/oauth-protected-resource/mcp${brand ? `/${brand}` : ""}`;
  return Response.json({ error: "unauthorized" }, { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${meta}"` } });
}

const ok = (id: RpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: RpcRequest["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export async function handleMcp(req: Request, brand: string | null): Promise<Response> {
  const auth = await userFromBearer(req);
  if (!auth) return unauthorized(brand);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(fail(null, -32700, "Parse error"), { status: 400 });
  }
  let user;
  try {
    user = await resolveUser(auth.hash);
  } catch (e) {
    if (e instanceof SessionError) return unauthorized(brand);
    console.error("[mcp] auth", e);
    return Response.json(fail(null, -32603, "GPS Link is not reachable, try again later"), { status: 502 });
  }
  const config = await assistantConfig(user, "en");
  const { tools } = readTools(user, "en");

  const handle = async (msg: RpcRequest) => {
    if (!msg || typeof msg !== "object" || typeof msg.method !== "string") return fail(msg?.id, -32600, "Invalid request");
    if (msg.id === undefined) return null;
    switch (msg.method) {
      case "initialize": {
        const asked = String(msg.params?.protocolVersion ?? "");
        return ok(msg.id, {
          protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: `${config.companyName} GPS`, version: "1.0.0" },
          instructions: `Tools to read the customer's own GPS-tracked vehicles at ${config.companyName}: find a vehicle, its live location and status, and trip history. Read-only. Never invent locations or data.`,
        });
      }
      case "ping":
        return ok(msg.id, {});
      case "tools/list":
        return ok(msg.id, { tools: TOOLS });
      case "tools/call": {
        const name = String(msg.params?.name ?? "");
        const fn = TOOLS.some((t) => t.name === name) ? tools[name] : undefined;
        if (!fn) return fail(msg.id, -32602, `Unknown tool: ${name}`);
        if (!config.enabled) return ok(msg.id, { content: [{ type: "text", text: `The assistant is not enabled for this ${config.companyName} account. Ask ${config.companyName} to enable it.` }], isError: true });
        if (rateLimit(`mcp:${user.userId}:${user.email}`, 30)) return ok(msg.id, { content: [{ type: "text", text: "Too many requests, wait a minute and try again." }], isError: true });
        try {
          const result = await fn((msg.params?.arguments as Record<string, unknown>) ?? {});
          const isError = !!result && typeof result === "object" && "error" in result;
          return ok(msg.id, { content: [{ type: "text", text: JSON.stringify(result) }], isError });
        } catch (e) {
          if (e instanceof SessionError) throw e;
          console.error("[mcp] tool", name, e);
          return ok(msg.id, { content: [{ type: "text", text: "GPS Link did not answer, try again later." }], isError: true });
        }
      }
      default:
        return fail(msg.id, -32601, `Method not found: ${msg.method}`);
    }
  };

  try {
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map((m) => handle(m as RpcRequest)))).filter(Boolean);
      return out.length ? Response.json(out) : new Response(null, { status: 202 });
    }
    const out = await handle(body as RpcRequest);
    return out ? Response.json(out) : new Response(null, { status: 202 });
  } catch (e) {
    if (e instanceof SessionError) return unauthorized(brand);
    throw e;
  }
}

export function mcpNotAllowed(): Response {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
