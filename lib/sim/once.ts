// 1NCE Management API (read-only). Uses the portal user via OAuth client credentials; no captcha.
const BASE = (process.env.ONCE_API_URL ?? "https://api.1nce.com/management-api").replace(/\/$/, "");

export type OnceSim = {
  iccid: string;
  imsi: string | null;
  msisdn: string | null;
  imei: string | null;
  status: string;
  activation_date: string | null;
  label: string | null;
};

export type OnceQuota = { volume: number | null; total_volume: number | null; expiry_date: string | null };

export function onceConfigured(): boolean {
  return !!(process.env.ONCE_API_USER && process.env.ONCE_API_PASSWORD);
}

export async function onceToken(): Promise<string> {
  if (!onceConfigured()) throw new Error("Faltan ONCE_API_USER / ONCE_API_PASSWORD");
  const basic = Buffer.from(`${process.env.ONCE_API_USER}:${process.env.ONCE_API_PASSWORD}`).toString("base64");
  const res = await fetch(`${BASE}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(25_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`1NCE login: ${data.message ?? res.status}`);
  return data.access_token;
}

async function get<T>(path: string, token: string): Promise<{ data: T; totalPages: number }> {
  const res = await fetch(`${BASE}/v1${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`1NCE ${path.split("?")[0]}: ${res.status}`);
  return { data: (await res.json()) as T, totalPages: Number(res.headers.get("x-total-pages") ?? 1) };
}

export async function onceSims(token: string): Promise<OnceSim[]> {
  const out: OnceSim[] = [];
  for (let page = 1; page <= 100; page++) {
    const r = await get<OnceSim[]>(`/sims?page=${page}&pageSize=100`, token);
    out.push(...r.data);
    if (page >= r.totalPages) break;
  }
  return out;
}

export const onceQuota = async (token: string, iccid: string) => (await get<OnceQuota>(`/sims/${encodeURIComponent(iccid)}/quota/data`, token)).data;

export const onceStatus = (s: string) => ({ enabled: 2, disabled: 3, deleted: 5 } as Record<string, number>)[String(s).toLowerCase()] ?? 0;

const luhn = (body: string) => {
  const sum = [...body].reverse().reduce((s, ch, i) => {
    const d = Number(ch) * (i % 2 === 0 ? 2 : 1);
    return s + (d > 9 ? d - 9 : d);
  }, 0);
  return String((10 - (sum % 10)) % 10);
};

// The API reports IMEISV (16 digits): the IMEI is its first 14 digits plus the Luhn check digit.
export const onceImei = (imei: string | null) => (imei && /^\d{16}$/.test(imei) ? imei.slice(0, 14) + luhn(imei.slice(0, 14)) : imei);
