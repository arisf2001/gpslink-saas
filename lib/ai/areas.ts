import { prisma } from "../db";
import { userGeofences } from "../gpswox";
import type { Lang } from "./assistant";
import { meters, placeKind } from "./geocode";

// Named areas a point is inside: first the customer's own geofences, then map outlines (gpslink_places.place_area, built by scripts/import-places.py).
type Pt = { lat: number; lng: number };
type Zone = { name: string; deviceId: number | null; circle: { center: Pt; radius: number } | null; polygon: Pt[] | null };
const zoneCache = new Map<number, { at: number; zones: Zone[] }>();

const valid = (p: Pt | null | undefined): p is Pt => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
// mysql2 may hand JSON columns over already parsed.
const json = <T>(s: unknown): T | null => {
  try {
    return typeof s === "string" ? (JSON.parse(s) as T) : ((s ?? null) as T | null);
  } catch {
    return null;
  }
};

export function inPoints(lat: number, lng: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.lat > lat !== b.lat > lat && lng < ((b.lng - a.lng) * (lat - a.lat)) / (b.lat - a.lat) + a.lng) inside = !inside;
  }
  return inside;
}

async function zonesOf(userId: number): Promise<Zone[]> {
  const hit = zoneCache.get(userId);
  if (hit && Date.now() - hit.at < 2 * 60_000) return hit.zones;
  const zones: Zone[] = [];
  for (const g of await userGeofences(userId)) {
    if (!g.name.trim()) continue;
    const center = json<Pt>(g.center);
    if (g.type === "circle" && valid(center) && g.radius && g.radius > 0) zones.push({ name: g.name.trim(), deviceId: g.device_id, circle: { center, radius: g.radius }, polygon: null });
    const points = json<Pt[]>(g.coordinates);
    if (g.type === "polygon" && Array.isArray(points) && points.length >= 3 && points.every(valid)) zones.push({ name: g.name.trim(), deviceId: g.device_id, circle: null, polygon: points });
  }
  zoneCache.set(userId, { at: Date.now(), zones });
  return zones;
}

/** Name of the customer's own geofence the point is in (the smallest one when several overlap). */
export async function zoneAt(userId: number, deviceId: number, lat: number, lng: number): Promise<string | null> {
  if (!valid({ lat, lng }) || (lat === 0 && lng === 0)) return null;
  const zones = await zonesOf(userId).catch((): Zone[] => []);
  const size = (z: Zone) => (z.circle ? z.circle.radius ** 2 * Math.PI : spread(z.polygon!));
  const inside = zones
    .filter((z) => z.deviceId === null || z.deviceId === deviceId)
    .filter((z) => (z.circle ? meters(lat, lng, z.circle.center.lat, z.circle.center.lng) <= z.circle.radius : inPoints(lat, lng, z.polygon!)))
    .sort((a, b) => size(a) - size(b));
  return inside[0]?.name ?? null;
}

function spread(poly: Pt[]): number {
  const lats = poly.map((p) => p.lat);
  const lngs = poly.map((p) => p.lng);
  return (Math.max(...lats) - Math.min(...lats)) * (Math.max(...lngs) - Math.min(...lngs)) * 1e10;
}

export type MapArea = { inside: string | null; inside_kind: string | null; inside_of: string | null; inside_of_kind: string | null };

/** The smallest mapped place (school, park, mall, parking...) the point is in, and the named place around it (e.g. a parking inside a mall). */
export async function mapAreaAt(lat: number, lng: number, lang: Lang): Promise<MapArea | null> {
  if (!valid({ lat, lng }) || (lat === 0 && lng === 0)) return null;
  const point = `POINT(${lng} ${lat})`;
  const rows = await prisma
    .$queryRawUnsafe<{ kind: string; name: string | null }[]>(
      "SELECT kind, name FROM gpslink_places.place_area WHERE MBRContains(geom, ST_GeomFromText(?)) AND ST_Contains(geom, ST_GeomFromText(?)) ORDER BY area LIMIT 5",
      point,
      point,
    )
    .catch(() => []);
  if (!rows.length) return null;
  const [first] = rows;
  const outer = rows.slice(1).find((r) => r.name && r.name !== first.name) ?? null;
  if (!first.name && !outer) return { inside: null, inside_kind: placeKind(undefined, first.kind, lang), inside_of: null, inside_of_kind: null };
  return {
    inside: first.name,
    inside_kind: placeKind(undefined, first.kind, lang) ?? first.kind,
    inside_of: outer?.name ?? null,
    inside_of_kind: outer ? (placeKind(undefined, outer.kind, lang) ?? outer.kind) : null,
  };
}
