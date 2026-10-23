import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET() {
  const companyId = await getSession("company");
  if (!companyId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const s = await prisma.waSession.findUnique({ where: { companyId } });
  const workerUp = !!s?.beatAt && Date.now() - s.beatAt.getTime() < 60_000;
  return Response.json({
    want: s?.want ?? false,
    status: s?.status ?? "OFF",
    phone: s?.phone ?? null,
    error: s?.error ?? null,
    workerUp,
    qr: s?.status === "QR" && s.qr ? await QRCode.toDataURL(s.qr, { margin: 1, width: 280 }) : null,
  });
}
