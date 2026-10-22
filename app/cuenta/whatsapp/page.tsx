import { redirect } from "next/navigation";
import { requireTab } from "@/lib/tabs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { SiteNav } from "../../site-nav";
import { CuentaNav } from "../cuenta-nav";
import { connectWhatsAppAction, disconnectWhatsAppAction } from "./actions";
import { WhatsAppStatus } from "./status";

export const dynamic = "force-dynamic";

export default async function WhatsAppPage() {
  const companyId = await getSession("company");
  await requireTab("whatsapp");
  if (!companyId) redirect("/cuenta");
  const [company, s, linked, sent] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { aiEnabled: true } }),
    prisma.waSession.findUnique({ where: { companyId } }),
    prisma.waLink.count({ where: { companyId } }),
    prisma.waOutbox.count({ where: { companyId, status: "sent" } }),
  ]);
  const initial = { want: s?.want ?? false, status: s?.status ?? "OFF", phone: s?.phone ?? null, error: s?.error ?? null, workerUp: true, qr: null };
  return (
    <>
      <SiteNav />
      <div className="wrap" style={{ maxWidth: 960, paddingBottom: 40 }}>
        <CuentaNav active="whatsapp" />
        <div className="panel">
          <h1 style={{ fontSize: 22, marginBottom: 6 }}>Mi WhatsApp</h1>
          <p className="hint" style={{ marginBottom: 12 }}>
            Conecta el WhatsApp de tu negocio con un código QR, como WhatsApp Web. Por ese número salen los avisos de cobro a tus clientes
            {company?.aiEnabled ? " y el asistente IA les responde dónde están sus vehículos." : ". El asistente IA para responder a tus clientes se activa desde GPS Link."}
          </p>
          <div className="err" style={{ marginBottom: 12, background: "#fffbeb", borderColor: "#fcd34d", color: "#92400e" }}>
            Importante: esta conexión no es la oficial de Meta. Si WhatsApp detecta muchos mensajes automáticos puede bloquear el número. Usa un número solo para el negocio, no el personal.
          </div>
          <WhatsAppStatus key={`${initial.want}-${initial.status}`} initial={initial} />
          <div className="row" style={{ marginTop: 14, gap: 8 }}>
            {!s?.want ? (
              <form action={connectWhatsAppAction}><button className="btn dark">Conectar WhatsApp</button></form>
            ) : (
              <form action={disconnectWhatsAppAction}><button className="btn sm red">Desconectar</button></form>
            )}
          </div>
          <p className="hint" style={{ marginTop: 14 }}>Clientes que conectaron su WhatsApp con el asistente: {linked} · Avisos enviados por WhatsApp: {sent}</p>
        </div>
      </div>
    </>
  );
}
