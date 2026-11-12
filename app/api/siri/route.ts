import { assistantConfig, rateLimit, resolveUser, t, type Lang } from "@/lib/ai/assistant";
import { chat } from "@/lib/ai/engine";
import { SessionError } from "@/lib/ai/gps";
import { prisma } from "@/lib/db";
import { siriKeyFor } from "@/lib/siri";

// iPhone Siri shortcut: "Dictate text" → POST {q} here with the user's personal key → Siri speaks the plain-text reply.
// Same voice rules as Alexa (read-only, no engine commands). Follow-ups within 5 minutes keep the conversation.

const FOLLOW_UP_MS = 5 * 60_000;
const text = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

async function answer(req: Request, url: URL, question: string) {
  const lang: Lang = url.searchParams.get("lang")?.startsWith("en") ? "en" : "es";
  const token = url.searchParams.get("k") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const key = await siriKeyFor(token);
  if (!key) return text(t(lang, "Tu clave de Siri no es válida. Crea una nueva en la página del asistente.", "Your Siri key is not valid. Create a new one on the assistant page."), 401);
  const q = question.trim().slice(0, 500);
  if (!q) return text(t(lang, "No escuché la pregunta. Vuelve a intentarlo.", "I didn't hear the question. Please try again."));
  if (rateLimit(`siri:${key.gpswoxUserId}`, 12)) return text(t(lang, "Espera un momento y vuelve a preguntar.", "Please wait a moment and ask again."), 429);
  try {
    const user = await resolveUser(key.hash);
    const config = await assistantConfig(user, lang);
    if (!config.enabled) return text(t(lang, `El asistente no está activo en tu cuenta de ${config.companyName}.`, `The assistant is not enabled on your ${config.companyName} account.`));
    const recent = key.lastUsedAt && Date.now() - key.lastUsedAt.getTime() < FOLLOW_UP_MS;
    const result = await chat({ user, conversationId: recent ? key.conversationId : null, message: q, lang, deviceId: null, channel: "alexa" });
    await prisma.siriKey.update({ where: { gpswoxUserId: key.gpswoxUserId }, data: { conversationId: result.conversation_id, lastUsedAt: new Date() } });
    return text(result.reply);
  } catch (e) {
    if (e instanceof SessionError) return text(t(lang, "Tu cuenta cambió. Crea una nueva clave de Siri en la página del asistente.", "Your account changed. Create a new Siri key on the assistant page."), 401);
    console.error("[siri]", e);
    return text(t(lang, "No pude responder ahora. Intenta otra vez.", "I couldn't answer right now. Please try again."), 500);
  }
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const raw = await req.text();
  let q = raw;
  try {
    const body = JSON.parse(raw) as { q?: unknown };
    if (body && typeof body === "object") q = String(body.q ?? "");
  } catch {}
  return answer(req, url, q || (url.searchParams.get("q") ?? ""));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  return answer(req, url, url.searchParams.get("q") ?? "");
}
