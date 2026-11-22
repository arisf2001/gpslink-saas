import type { Lang } from "./assistant";

// Reverse geocoding with OpenStreetMap Nominatim (free; policy: max 1 request/second, identify the app, cache results).
export type Place = { street: string | null; neighbourhood: string | null; city: string | null; state: string | null; country: string | null; near: string | null; nearMeters: number | null; nearKind: string | null; nearStreet: string | null };

const UA = "GPSLinkUSA/1.0 (https://gpslinkusa.com; arisf2001@gmail.com)";
const cache = new Map<string, { at: number; place: Place | null }>();
let queue: Promise<unknown> = Promise.resolve();
let last = 0;

type NominatimAddress = Record<string, string | undefined>;
type NominatimResult = { name?: string; lat?: string; lon?: string; category?: string; type?: string; address?: NominatimAddress; error?: string };

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

async function nominatim(lat: number, lng: number, lang: Lang, poi: boolean): Promise<NominatimResult | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=${lang}${poi ? "&layer=poi" : ""}`;
  try {
    const res = await throttled(() => fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(2500) }));
    if (!res.ok) return null;
    const data = (await res.json()) as NominatimResult;
    return data.error ? null : data;
  } catch {
    return null;
  }
}

export function meters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return Math.round(12742000 * Math.asin(Math.sqrt(a)));
}

const KINDS: Record<string, [string, string]> = {
  fuel: ["estación de combustible", "gas station"], park: ["parque", "park"], university: ["universidad", "university"], college: ["instituto", "college"], school: ["escuela", "school"],
  hospital: ["hospital", "hospital"], clinic: ["clínica", "clinic"], pharmacy: ["farmacia", "pharmacy"], bank: ["banco", "bank"], atm: ["cajero", "ATM"],
  place_of_worship: ["iglesia", "place of worship"], restaurant: ["restaurante", "restaurant"], fast_food: ["comida rápida", "fast food"], cafe: ["cafetería", "café"], bar: ["bar", "bar"],
  mall: ["plaza comercial", "shopping mall"], supermarket: ["supermercado", "supermarket"], convenience: ["colmado o tienda", "convenience store"], hardware: ["ferretería", "hardware store"],
  car_repair: ["taller", "car repair shop"], car: ["concesionario", "car dealer"], parking: ["parqueo", "parking lot"], marketplace: ["mercado", "market"], police: ["policía", "police station"],
  fire_station: ["bomberos", "fire station"], hotel: ["hotel", "hotel"], stadium: ["estadio", "stadium"], sports_centre: ["centro deportivo", "sports centre"], playground: ["parque infantil", "playground"],
  townhall: ["ayuntamiento", "town hall"], post_office: ["correo", "post office"], bus_station: ["terminal de autobuses", "bus station"], aerodrome: ["aeropuerto", "airport"], cemetery: ["cementerio", "cemetery"],
  pitch: ["cancha", "sports field"], gym: ["gimnasio", "gym"], fitness_centre: ["gimnasio", "gym"], department_store: ["tienda por departamentos", "department store"], clothes: ["tienda de ropa", "clothing store"],
  retail: ["zona comercial", "shopping area"], golf_course: ["campo de golf", "golf course"], marina: ["marina", "marina"], water_park: ["parque acuático", "water park"],
  attraction: ["atracción turística", "attraction"], zoo: ["zoológico", "zoo"], theme_park: ["parque de diversiones", "theme park"], museum: ["museo", "museum"],
  community_centre: ["centro comunitario", "community centre"],
};

export function placeKind(category: string | undefined, type: string | undefined, lang: Lang): string | null {
  const k = KINDS[type ?? ""];
  if (k) return lang === "en" ? k[1] : k[0];
  if (category === "shop") return lang === "en" ? "store" : "tienda";
  if (category === "leisure") return lang === "en" ? "recreation area" : "área recreativa";
  if (category === "tourism") return lang === "en" ? "tourist place" : "lugar turístico";
  return null;
}

export function placeFrom(addr: NominatimResult | null, poi: NominatimResult | null, lat: number, lng: number, lang: Lang = "es"): Place | null {
  const a = addr?.address;
  if (!a) return null;
  const road = a.road ?? a.pedestrian ?? a.footway ?? a.highway ?? null;
  const street = road ? (a.house_number ? `${road} ${a.house_number}` : road) : null;
  let near: string | null = null;
  let nearMeters: number | null = null;
  let nearKind: string | null = null;
  let nearStreet: string | null = null;
  if (poi?.name && poi.lat && poi.lon) {
    const d = meters(lat, lng, Number(poi.lat), Number(poi.lon));
    if (d <= 500) {
      near = poi.name;
      nearMeters = d;
      nearKind = placeKind(poi.category, poi.type, lang);
      nearStreet = poi.address?.road ?? null;
    }
  }
  return {
    street,
    neighbourhood: a.neighbourhood ?? a.suburb ?? a.quarter ?? a.hamlet ?? null,
    city: a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null,
    state: a.state ?? a.province ?? a.region ?? null,
    country: a.country ?? null,
    near,
    nearMeters,
    nearKind,
    nearStreet,
  };
}

export async function reverseGeocode(lat: number, lng: number, lang: Lang): Promise<Place | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  const key = `${lang}:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.place;
  const [addr, poi] = await Promise.all([nominatim(lat, lng, lang, false), nominatim(lat, lng, lang, true)]);
  const place = placeFrom(addr, poi, lat, lng, lang);
  if (place || addr) cache.set(key, { at: Date.now(), place });
  if (cache.size > 20000) cache.delete(cache.keys().next().value!);
  return place;
}

// Place search (city, state, country...) with its boundary, to find which vehicles are inside it.
type Ring = number[][];
type Geometry = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] } | { type: string; coordinates?: unknown };
export type FoundPlace = { name: string; kind: string; geometry: Geometry; bbox: [number, number, number, number] };
const placeCache = new Map<string, { at: number; place: FoundPlace | null }>();

export async function findPlace(query: string, lang: Lang): Promise<FoundPlace | null> {
  const q = query.trim().slice(0, 120);
  if (!q) return null;
  const key = `${lang}:${q.toLowerCase()}`;
  const hit = placeCache.get(key);
  if (hit && Date.now() - hit.at < 7 * 864e5) return hit.place;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=1&polygon_geojson=1&polygon_threshold=0.005&accept-language=${lang}`;
  let place: FoundPlace | null = null;
  try {
    const res = await throttled(() => fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(4000) }));
    if (!res.ok) return null;
    const first = ((await res.json()) as { display_name?: string; addresstype?: string; type?: string; boundingbox?: string[]; geojson?: Geometry }[])[0];
    if (first?.geojson && first.boundingbox) {
      const [s, n, w, e] = first.boundingbox.map(Number);
      place = { name: String(first.display_name ?? q), kind: String(first.addresstype ?? first.type ?? "place"), geometry: first.geojson, bbox: [s, n, w, e] };
    }
  } catch {
    return null;
  }
  placeCache.set(key, { at: Date.now(), place });
  if (placeCache.size > 2000) placeCache.delete(placeCache.keys().next().value!);
  return place;
}

function inRing(lat: number, lng: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const inPolygon = (lat: number, lng: number, rings: Ring[]) => rings.length > 0 && inRing(lat, lng, rings[0]) && !rings.slice(1).some((hole) => inRing(lat, lng, hole));

export function insidePlace(lat: number, lng: number, place: Pick<FoundPlace, "geometry" | "bbox">): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return false;
  const g = place.geometry;
  if (g.type === "Polygon") return inPolygon(lat, lng, g.coordinates as Ring[]);
  if (g.type === "MultiPolygon") return (g.coordinates as Ring[][]).some((p) => inPolygon(lat, lng, p));
  // A point or line result (small place): use a 2 km box around it.
  const [s, n, w, e] = place.bbox;
  const pad = 0.02;
  return lat >= s - pad && lat <= n + pad && lng >= w - pad && lng <= e + pad;
}
