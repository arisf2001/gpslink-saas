import { checkInternalKey, handleIncoming } from "@/lib/wa";

export async function POST(req: Request) {
  if (!checkInternalKey(req.headers.get("x-wa-key"))) return Response.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.companyId !== "string" || typeof body.phone !== "string") return Response.json({ error: "bad_request" }, { status: 400 });
  const reply = await handleIncoming(body.companyId, body.phone.replace(/\D/g, ""), typeof body.text === "string" ? body.text : "").catch((e) => {
    console.error("[wa]", e);
    return "Tuve un problema para responder. Intenta otra vez en un momento.";
  });
  return Response.json({ reply });
}
