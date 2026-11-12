// newsimcloud (eSIM) web portal: read-only. Login needs an image captcha, read with OpenAI vision. Credentials stay on the server.
const BASE = (process.env.ESIM_PROVIDER_URL ?? "http://g.newsimcloud.com").replace(/\/$/, "");
const OCR_MODEL = process.env.ESIM_OCR_MODEL ?? "gpt-4.1-mini";

type Res<T> = { code: number; msg: string } & T;

export type NewsimCard = {
  iccid: string;
  jtcid: string | null;
  msisdn: string | null;
  status: number;
  useFlow: number | null;
  activateTime: string | null;
  cardOpeningTime: string | null;
  saleName: string | null;
};

export type NewsimPackage = {
  salesName: string | null;
  status: number;
  dataControl: number | null;
  useFlow: number | null;
  activateTime: string | null;
  expireTime: string | null;
};

export function newsimConfigured(): boolean {
  return !!(process.env.ESIM_PROVIDER_USER && process.env.ESIM_PROVIDER_PASSWORD && process.env.OPENAI_API_KEY);
}

async function api<T>(path: string, init: RequestInit = {}, token?: string): Promise<Res<T>> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(25_000),
  });
  const data = (await res.json().catch(() => null)) as Res<T> | null;
  if (!data) throw new Error(`newsimcloud ${path}: respuesta inválida (${res.status})`);
  return data;
}

async function readCaptcha(base64: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OCR_MODEL,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "This is a login captcha image. Reply with only the characters shown (letters/digits, no spaces). If it is an arithmetic expression, reply with only the numeric result." },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
        ],
      }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${data?.error?.message ?? "error"}`);
  return String(data.choices?.[0]?.message?.content ?? "").replace(/[^0-9a-zA-Z-]/g, "");
}

export async function newsimLogin(attempts = 6): Promise<string> {
  if (!newsimConfigured()) throw new Error("Faltan ESIM_PROVIDER_USER / ESIM_PROVIDER_PASSWORD / OPENAI_API_KEY");
  let last = "";
  for (let i = 0; i < attempts; i++) {
    const cap = await api<{ captchaEnabled?: boolean; uuid?: string; img?: string }>("/captchaImage");
    const code = cap.captchaEnabled === false || !cap.img ? "" : await readCaptcha(cap.img);
    const r = await api<{ token?: string }>("/login", {
      method: "POST",
      body: JSON.stringify({ username: process.env.ESIM_PROVIDER_USER, password: process.env.ESIM_PROVIDER_PASSWORD, code, uuid: cap.uuid ?? "" }),
    });
    if (r.code === 200 && r.token) return r.token;
    last = r.msg;
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  throw new Error(`newsimcloud login: ${last || "no se pudo entrar"}`);
}

export async function newsimCards(token: string): Promise<NewsimCard[]> {
  const out: NewsimCard[] = [];
  for (let page = 1; page <= 100; page++) {
    const r = await api<{ rows?: NewsimCard[]; total?: number }>(`/card/list?pageNum=${page}&pageSize=100`, {}, token);
    if (r.code !== 200) throw new Error(`newsimcloud card/list: ${r.msg}`);
    const rows = r.rows ?? [];
    out.push(...rows);
    if (rows.length < 100 || out.length >= (r.total ?? 0)) break;
  }
  return out;
}

export async function newsimPackages(token: string, jtcid: string): Promise<NewsimPackage[]> {
  const r = await api<{ rows?: NewsimPackage[] }>(`/card/findSales?jtcid=${encodeURIComponent(jtcid)}`, {}, token);
  if (r.code !== 200) throw new Error(`newsimcloud card/findSales: ${r.msg}`);
  return r.rows ?? [];
}

// Portal card status: 1 activatable, 2 activated, 3 stopped, 4 cancelled -> our SIM_STATUS codes.
export const newsimStatus = (s: number) => ({ 1: 1, 2: 2, 3: 3, 4: 5 } as Record<number, number>)[Number(s)] ?? 0;

// Package status: 1 effective, 2 pending, 3 expired, 4 unsubscribed. Current = effective one with the latest expiry (else the last expired).
export function currentPackage(pkgs: NewsimPackage[]): { current: NewsimPackage | null; next: NewsimPackage | null } {
  const byExpiry = (a: NewsimPackage, b: NewsimPackage) => String(b.expireTime ?? "").localeCompare(String(a.expireTime ?? ""));
  const effective = pkgs.filter((p) => Number(p.status) === 1).sort(byExpiry);
  const expired = pkgs.filter((p) => Number(p.status) === 3 && p.expireTime).sort(byExpiry);
  return { current: effective[0] ?? expired[0] ?? null, next: pkgs.find((p) => Number(p.status) === 2) ?? null };
}

const PKG_ES: [RegExp, string][] = [[/半年有效/, "6 meses"], [/包年/, "1 año"], [/测试/, "prueba"], [/\/月/, "/mes"], [/独享/, ""], [/海外/, ""]];

export function packageEs(name: string | null | undefined): string | null {
  if (!name) return null;
  const parts = name.split("_");
  const out = parts.map((p) => PKG_ES.reduce((s, [re, es]) => s.replace(re, es), p)).filter((p) => p.trim());
  return out.join(" ").replace(/\s+/g, " ").trim() || name;
}
