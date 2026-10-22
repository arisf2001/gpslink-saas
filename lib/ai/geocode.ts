import type { Lang } from "./assistant";

// Reverse geocoding with OpenStreetMap Nominatim (free; policy: max 1 request/second, identify the app, cache results).
export type Place = { street: string | null; neighbourhood: string | null; city: string | null; state: string | null; country: string | null; near: string | null; nearMeters: number | null };

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

export function placeFrom(addr: NominatimResult | null, poi: NominatimResult | null, lat: number, lng: number): Place | null {
  const a = addr?.address;
  if (!a) return null;
  const road = a.road ?? a.pedestrian ?? a.footway ?? a.highway ?? null;
  const street = road ? (a.house_number ? `${road} ${a.house_number}` : road) : null;
  let near: string | null = null;
  let nearMeters: number | null = null;
  if (poi?.name && poi.lat && poi.lon) {
    const d = meters(lat, lng, Number(poi.lat), Number(poi.lon));
    if (d <= 500) {
      near = poi.name;
      nearMeters = d;
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
  };
}

export async function reverseGeocode(lat: number, lng: number, lang: Lang): Promise<Place | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  const key = `${lang}:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.place;
  const [addr, poi] = await Promise.all([nominatim(lat, lng, lang, false), nominatim(lat, lng, lang, true)]);
  const place = placeFrom(addr, poi, lat, lng);
  if (place || addr) cache.set(key, { at: Date.now(), place });
  if (cache.size > 20000) cache.delete(cache.keys().next().value!);
  return place;
}
