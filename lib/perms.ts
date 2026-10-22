import { trackerUrl } from "./config";
import { trackSsoToken } from "./track-sso";

// What a white label (and its clients) can see in the tracking platform, stored in GPSWOX user_permissions.
// GPSWOX caps every client by its manager's permissions, so a white label can never give more than we allow it.

export const MODES = [
  ["view", "v", "Ver"],
  ["edit", "e", "Editar / usar"],
  ["remove", "r", "Borrar"],
] as const;
export type Mode = (typeof MODES)[number][0];
export type PermMap = Record<string, Partial<Record<Mode, boolean | number>>>;
export type PermSet = Record<string, string>;

export const PERM_GROUPS: [string, [string, string][]][] = [
  ["Mapa y equipos", [
    ["devices", "Equipos"],
    ["history", "Historial de recorridos"],
    ["send_command", "Enviar comandos (apagar / encender motor)"],
    ["user_gprs_templates", "Plantillas de comandos"],
    ["user_sms_templates", "Plantillas de comandos SMS"],
    ["sms_gateway", "Comandos por SMS"],
    ["sharing", "Compartir ubicación"],
    ["camera", "Cámaras"],
    ["device_camera", "Cámaras del equipo"],
    ["device_configuration", "Configurar el equipo"],
  ]],
  ["Alertas y zonas", [
    ["alerts", "Alertas"],
    ["events", "Eventos (avisos recibidos)"],
    ["custom_events", "Eventos personalizados"],
    ["geofences", "Geocercas (zonas)"],
    ["routes", "Rutas"],
    ["poi", "Puntos de interés"],
  ]],
  ["Reportes y gestión", [
    ["reports", "Reportes"],
    ["maintenance", "Mantenimiento"],
    ["drivers", "Conductores"],
    ["tasks", "Tareas"],
    ["task_sets", "Grupos de tareas"],
    ["chat", "Chat"],
    ["device_expenses", "Gastos del vehículo"],
    ["device_route_types", "Tipos de ruta"],
  ]],
  ["Datos del equipo", [
    ["device.imei", "IMEI"],
    ["device.sim_number", "Número de SIM"],
    ["device.msisdn", "Teléfono de la SIM"],
    ["device.protocol", "Protocolo"],
    ["device.expiration_date", "Vencimiento del servicio"],
    ["device.installation_date", "Fecha de instalación"],
    ["device.sim_activation_date", "Activación de la SIM"],
    ["device.sim_expiration_date", "Vencimiento de la SIM"],
    ["device.device_model", "Modelo"],
    ["device.plate_number", "Placa"],
    ["device.registration_number", "Matrícula"],
    ["device.object_owner", "Propietario"],
    ["device.vin", "VIN (chasis)"],
    ["device.additional_notes", "Notas"],
    ["device.comment", "Comentarios"],
    ["device.max_speed", "Velocidad máxima"],
    ["device.forward", "Reenvío de datos"],
  ]],
  ["Usuarios", [
    ["users", "Crear subusuarios"],
    ["user.client_id", "ID de cliente"],
  ]],
];

const KNOWN = new Set(PERM_GROUPS.flatMap(([, items]) => items.map(([name]) => name)));

// Groups for display; names GPSWOX returns that we have no label for go to "Otras opciones".
export function groupedPerms(available: PermMap): [string, [string, string][]][] {
  const groups = PERM_GROUPS.map(([title, items]) => [title, items.filter(([name]) => name in available)] as [string, [string, string][]]);
  const other = Object.keys(available).filter((n) => !KNOWN.has(n)).map((n) => [n, n] as [string, string]);
  return [...groups, ["Otras opciones", other] as [string, [string, string][]]].filter(([, items]) => items.length);
}

export function permSetFromForm(formData: FormData): PermSet {
  const names = String(formData.get("permNames") ?? "").split(",").filter(Boolean);
  const set: PermSet = {};
  for (const name of names) set[name] = MODES.filter(([mode]) => formData.get(`perm:${name}:${mode}`) === "on").map(([, letter]) => letter).join("");
  return set;
}

export function isPermSet(value: unknown): value is PermSet {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every((v) => typeof v === "string");
}

export type PermTarget = { kind: "reseller" } | { kind: "clients" } | { kind: "client"; id: number };
export type PermsResult = { available: PermMap; current: PermMap | null; clients: number; updated?: number };

export async function platformPerms(resellerId: number, target: PermTarget, set?: PermSet): Promise<PermsResult> {
  const extra: Record<string, unknown> = { scope: "perms", target: target.kind };
  if (target.kind === "client") extra.client = target.id;
  if (set) extra.set = set;
  const token = trackSsoToken(resellerId, Date.now(), extra);
  const res = await fetch(`${trackerUrl()}/gpslink/permissions?t=${encodeURIComponent(token)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`plataforma ${res.status}`);
  return (await res.json()) as PermsResult;
}

export function permMapFromSet(set: PermSet): PermMap {
  return Object.fromEntries(Object.entries(set).map(([name, letters]) => [name, Object.fromEntries(MODES.map(([mode, letter]) => [mode, letters.includes(letter)]))]));
}
