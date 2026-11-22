import { X509Certificate, verify } from "node:crypto";
import { rootCertificates } from "node:tls";

// Verifies that a request really comes from Alexa (required by Amazon for HTTPS skill endpoints).
// https://developer.amazon.com/en-US/docs/alexa/custom-skills/host-a-custom-skill-as-a-web-service.html

const certCache = new Map<string, { at: number; chain: X509Certificate[] }>();
const roots = rootCertificates.map((pem) => new X509Certificate(pem));

export function validCertUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    const path = new URL(u.pathname, "https://x").pathname;
    return u.protocol === "https:" && u.hostname.toLowerCase() === "s3.amazonaws.com" && (u.port === "" || u.port === "443") && path.startsWith("/echo.api/");
  } catch {
    return false;
  }
}

async function chainFor(url: string): Promise<X509Certificate[]> {
  const hit = certCache.get(url);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.chain;
  const pem = await (await fetch(url, { signal: AbortSignal.timeout(5000) })).text();
  const chain = (pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []).map((c) => new X509Certificate(c));
  certCache.set(url, { at: Date.now(), chain });
  return chain;
}

export async function verifyAlexaRequest(headers: Headers, rawBody: string, timestamp: string | undefined): Promise<string | null> {
  const url = headers.get("signaturecertchainurl") ?? "";
  const sig = headers.get("signature-256") ?? "";
  if (!url || !sig || !validCertUrl(url)) return "bad signature headers";
  const ts = timestamp ? Date.parse(timestamp) : NaN;
  if (!(Math.abs(Date.now() - ts) <= 150_000)) return "stale request";
  const chain = await chainFor(url).catch(() => []);
  const leaf = chain[0];
  if (!leaf) return "no certificate";
  const now = Date.now();
  if (Date.parse(leaf.validFrom) > now || Date.parse(leaf.validTo) < now) return "certificate expired";
  if (!(leaf.subjectAltName ?? "").split(/,\s*/).includes("DNS:echo-api.amazon.com")) return "wrong certificate subject";
  for (let i = 0; i < chain.length - 1; i++) {
    if (!chain[i].checkIssued(chain[i + 1]) || !chain[i].verify(chain[i + 1].publicKey)) return "broken certificate chain";
  }
  const top = chain[chain.length - 1];
  if (!roots.some((r) => r.fingerprint256 === top.fingerprint256 || (top.checkIssued(r) && top.verify(r.publicKey)))) return "untrusted certificate";
  if (!verify("sha256", Buffer.from(rawBody), leaf.publicKey, Buffer.from(sig, "base64"))) return "bad signature";
  return null;
}

export type AlexaResponse = { version: "1.0"; sessionAttributes?: Record<string, unknown>; response: Record<string, unknown> };

function clean(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#`>]/g, "")
    .replace(/[&<>"']/g, (c) => ({ "&": " y ", "<": " ", ">": " ", '"': "", "'": "" })[c]!)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 7000);
}

export function speak(text: string, opts: { end?: boolean; reprompt?: string; attributes?: Record<string, unknown>; linkAccount?: boolean } = {}): AlexaResponse {
  const response: Record<string, unknown> = { outputSpeech: { type: "PlainText", text: clean(text) }, shouldEndSession: opts.end ?? false };
  if (opts.reprompt && !opts.end) response.reprompt = { outputSpeech: { type: "PlainText", text: clean(opts.reprompt) } };
  if (opts.linkAccount) response.card = { type: "LinkAccount" };
  return { version: "1.0", sessionAttributes: opts.attributes, response };
}
