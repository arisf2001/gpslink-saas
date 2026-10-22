import { checkInternalKey, handleIncoming } from "@/lib/wa";
import { speech, transcribe } from "@/lib/voice";

// A voice note in gets a voice note back, plus the map link as text; text in gets text back.
export async function POST(req: Request) {
  if (!checkInternalKey(req.headers.get("x-wa-key"))) return Response.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.companyId !== "string" || typeof body.phone !== "string") return Response.json({ error: "bad_request" }, { status: 400 });
  const voice = typeof body.audio === "string" && body.audio.length > 0;
  const fail = (e: unknown) => {
    console.error("[wa]", e);
    return "Tuve un problema para responder. Intenta otra vez en un momento.";
  };
  let text = typeof body.text === "string" ? body.text : "";
  if (voice) text = await transcribe(Buffer.from(body.audio, "base64"), typeof body.mime === "string" ? body.mime : "audio/ogg").catch((e) => (console.error("[wa] transcribe", e), ""));
  const links: string[] = [];
  const reply = await handleIncoming(body.companyId, body.phone.replace(/\D/g, ""), text, { voice, links }).catch(fail);
  const link = links.length ? links.join("\n") : null;
  if (!voice || !reply || /https?:\/\//.test(reply)) return Response.json({ reply: reply && link ? `${reply}\n${link}` : reply });
  const audio = await speech(reply).catch((e) => (console.error("[wa] speech", e), null));
  if (!audio) return Response.json({ reply: link ? `${reply}\n${link}` : reply });
  return Response.json({ reply, audio: audio.toString("base64"), link });
}
