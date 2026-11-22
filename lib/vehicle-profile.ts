import type { RowDataPacket } from "mysql2";
import { isMock, withGpswoxDb } from "./gpswox";

// Make, model, year, color, type and nickname saved from the GPSWOX device form (table gpslink_vehicles).
export type VehicleProfile = { brand: string | null; model: string | null; year: number | null; color: string | null; type: string | null; nickname: string | null };

const COLORS: Record<string, string[]> = {
  blanco: ["blanco", "blanca", "white"], negro: ["negro", "negra", "black"], gris: ["gris", "gray", "grey"], plateado: ["plateado", "plateada", "plata", "silver"],
  rojo: ["rojo", "roja", "red"], vino: ["vino", "burgundy", "guinda"], azul: ["azul", "blue"], verde: ["verde", "green"], amarillo: ["amarillo", "amarilla", "yellow"],
  naranja: ["naranja", "anaranjado", "orange"], marron: ["marron", "cafe", "brown"], beige: ["beige", "crema"], dorado: ["dorado", "dorada", "gold"],
};
const TYPES: Record<string, string[]> = {
  carro: ["carro", "auto", "sedan", "car"], jeepeta: ["jeepeta", "suv", "yipeta", "jeep"], camioneta: ["camioneta", "pickup", "pick-up", "truck"],
  guagua: ["guagua", "van", "minivan", "bus"], camion: ["camion", "truck", "lorry"], motor: ["motor", "moto", "motocicleta", "motorcycle", "motorbike"],
};
const FILLER = new Set(["el", "la", "los", "las", "de", "del", "mi", "the", "my", "a", "un", "una"]);

export const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export const colorName = (k: string | null) => (k ? COLORS[k]?.[0] ?? k : null);
export const typeName = (k: string | null) => (k ? TYPES[k]?.[0] ?? k : null);

// Every word of the search must match the name, plate, nickname, make, model, year, color or type.
export function matchesVehicle(search: string, v: { name: string; plate: string | null }, p: VehicleProfile | undefined): boolean {
  const q = normalize(search);
  if (!q) return true;
  const fields = [v.name, v.plate, p?.nickname, p?.brand, p?.model, p?.year?.toString()].filter(Boolean).map((f) => normalize(String(f)));
  if (fields.some((f) => f.includes(q))) return true;
  const words = q.split(/\s+/).filter((w) => !FILLER.has(w));
  if (!words.length) return false;
  const synonyms = [...(p?.color ? COLORS[p.color] ?? [p.color] : []), ...(p?.type ? TYPES[p.type] ?? [p.type] : [])];
  return words.every((w) => fields.some((f) => f.split(/[^a-z0-9]+/).some((t) => t === w || (w.length >= 3 && t.startsWith(w)))) || synonyms.includes(w));
}

export async function vehicleProfiles(ids: number[]): Promise<Map<number, VehicleProfile>> {
  const out = new Map<number, VehicleProfile>();
  if (!ids.length || isMock()) return out;
  return withGpswoxDb(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT device_id, brand, model, year, color, vtype, nickname FROM gpslink_vehicles WHERE device_id IN (?)", [ids]);
    for (const r of rows) out.set(Number(r.device_id), { brand: r.brand ?? null, model: r.model ?? null, year: r.year ? Number(r.year) : null, color: r.color ?? null, type: r.vtype ?? null, nickname: r.nickname ?? null });
    return out;
  }).catch(() => out);
}
