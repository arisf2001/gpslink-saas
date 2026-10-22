// Telebay / Global IoT open API. Read-only here: token + paged card list. Credentials stay on the server.
const BASE = (process.env.TELEBAY_URL ?? "https://web.telebay.cn/global-iot-api").replace(/\/$/, "");

type Res<T> = { code: number; msg: string; data: T };

export type TelebayPackage = { packageId: string; totalFlow: number; usedFlow: number; residualFlow: number; cycle: number; status: number; beginTime: string | null; endTime: string | null };
export type TelebayCard = {
  iccid: string;
  imei: string | null;
  imsi: string | null;
  msisdn: string | null;
  activationTime: string | null;
  status: number;
  totalFlow: number;
  usedFlow: number;
  countryName: string | null;
  endTime: string | null;
  zyCardPackageDTO?: TelebayPackage[] | null;
};

let cached: { token: string; until: number } | null = null;

async function post<T>(path: string, body: unknown, token?: string): Promise<Res<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  const data = (await res.json().catch(() => null)) as Res<T> | null;
  if (!data) throw new Error(`Telebay ${path}: respuesta inválida (${res.status})`);
  return data;
}

export function telebayConfigured(): boolean {
  return !!(process.env.TELEBAY_APPID && process.env.TELEBAY_APPSECRET);
}

async function token(force = false): Promise<string> {
  if (cached && !force && cached.until > Date.now()) return cached.token;
  if (!telebayConfigured()) throw new Error("Faltan TELEBAY_APPID / TELEBAY_APPSECRET");
  const r = await post<string>("/oauth/token", { appid: process.env.TELEBAY_APPID, appSecret: process.env.TELEBAY_APPSECRET });
  if (r.code !== 0 || !r.data) throw new Error(`Telebay token: ${r.msg}`);
  const t = /^bearer /i.test(r.data) ? r.data : `Bearer ${r.data}`;
  cached = { token: t, until: Date.now() + 50 * 60_000 };
  return t;
}

export async function telebayCards(): Promise<TelebayCard[]> {
  const out: TelebayCard[] = [];
  for (let page = 1; page <= 200; page++) {
    let r = await post<{ list: TelebayCard[] }>("/open/pageQueryCard", { page: String(page), limit: "100" }, await token());
    if (r.code === 403 || r.code === 401) r = await post<{ list: TelebayCard[] }>("/open/pageQueryCard", { page: String(page), limit: "100" }, await token(true));
    if (r.code !== 0) throw new Error(`Telebay pageQueryCard: ${r.msg}`);
    const list = r.data?.list ?? [];
    out.push(...list);
    if (list.length < 100) break;
    await new Promise((ok) => setTimeout(ok, 100));
  }
  return out;
}

// Telebay dates are China time ("2027-05-31 23:59:59").
export function telebayDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const d = new Date(`${value.slice(0, 19).replace(" ", "T")}+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function cardExpiry(card: TelebayCard): Date | null {
  const dates = [card.endTime, ...(card.zyCardPackageDTO ?? []).map((p) => p.endTime)].map(telebayDate).filter((d): d is Date => !!d);
  return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
}

export function cardPackage(card: TelebayCard): string | null {
  const p = (card.zyCardPackageDTO ?? [])[0];
  return p ? `${p.totalFlow} MB · ${p.cycle} meses` : null;
}
