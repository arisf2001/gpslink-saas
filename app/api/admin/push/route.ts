import { prisma } from "@/lib/db";
import { parseSubscription, pushAdmin, saveSubscription } from "@/lib/push";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
  if (!(await getSession("admin"))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (body?.test) {
    const sent = await pushAdmin({ title: "GPS Link Admin", body: "Los avisos funcionan en esta computadora.", url: "/admin", tag: "test" });
    return Response.json({ ok: sent > 0, sent });
  }
  const sub = parseSubscription(body?.subscription);
  if (!sub) return Response.json({ error: "invalid" }, { status: 400 });
  await saveSubscription(sub, "admin", null, null);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await getSession("admin"))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (typeof body?.endpoint === "string") await prisma.pushSub.deleteMany({ where: { endpoint: body.endpoint, scope: "admin" } });
  return Response.json({ ok: true });
}
