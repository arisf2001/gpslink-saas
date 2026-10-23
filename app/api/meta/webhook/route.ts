import { after } from "next/server";
import { prisma } from "@/lib/db";
import { handleDirect, metaConfig, metaSend, validSignature } from "@/lib/meta";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const setting = await prisma.metaSetting.findUnique({ where: { id: 1 } });
  if (setting && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === setting.verifyToken)
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  return new Response("forbidden", { status: 403 });
}

type Incoming = { from: string; id: string; type: string; text?: { body?: string } };

export async function POST(req: Request) {
  const raw = await req.text();
  const cfg = await metaConfig();
  if (!cfg?.appSecret || !validSignature(cfg.appSecret, raw, req.headers.get("x-hub-signature-256"))) return new Response("forbidden", { status: 403 });
  let body: { entry?: { changes?: { value?: { messages?: Incoming[] } }[] }[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const messages = (body.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.messages ?? []));
  for (const m of messages) {
    const phone = String(m.from ?? "").replace(/\D/g, "");
    const text = m.type === "text" ? (m.text?.body ?? "") : `[${m.type}]`;
    try {
      await prisma.metaLog.create({ data: { direction: "in", phone, text: text.slice(0, 4000), wamid: m.id } });
    } catch {
      continue;
    }
    after(async () => {
      const reply = m.type === "text" ? await handleDirect(phone, text).catch(() => "Disculpa, tuve un problema. Intenta otra vez en un momento.") : "Por ahora solo entiendo mensajes de texto.";
      if (reply) await metaSend(cfg, phone, reply);
    });
  }
  return Response.json({ ok: true });
}
