import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { TICKET_STATUS } from "@/lib/tickets";
import { SiteNav } from "../../../site-nav";
import { TICKET_ERR, TicketThread } from "../../../ticket-thread";
import { CuentaNav } from "../../cuenta-nav";
import { closeTicketAction, replyTicketAction } from "../actions";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = {
  creado: "Ticket enviado. GPS Link te responde aquí y te avisa por correo.",
  enviado: "Mensaje enviado.",
  cerrado: "Ticket cerrado.",
  reabierto: "Ticket abierto otra vez.",
};

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const companyId = await getSession("company");
  if (!companyId) redirect("/cuenta");
  const { id } = await params;
  const ticket = await prisma.supportTicket.findFirst({ where: { id, companyId }, include: { company: { select: { name: true } }, messages: { orderBy: { createdAt: "asc" } } } });
  if (!ticket) redirect("/cuenta/soporte");
  const { ok, error } = await searchParams;
  const closed = ticket.status === "cerrado";
  return (
    <>
      <SiteNav />
      <div className="wrap" style={{ maxWidth: 860, paddingBottom: 40 }}>
        <h1 className="page-title">{ticket.company.name}</h1>
        <CuentaNav active="soporte" />
        {ok && OK[ok] && <div className="ok" style={{ marginBottom: 12 }}>{OK[ok]}</div>}
        {error && TICKET_ERR[error] && <div className="err" role="alert" style={{ marginBottom: 12 }}>{TICKET_ERR[error]}</div>}
        <p><Link href="/cuenta/soporte">← Mis tickets</Link></p>
        <div className="panel">
          <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 4 }}>{ticket.subject}</h2>
          <p className="hint" style={{ marginBottom: 12 }}>{TICKET_STATUS[ticket.status] ?? ticket.status}{ticket.device ? ` · Vehículo: ${ticket.device}` : ""}</p>
          <TicketThread messages={ticket.messages} />
        </div>
        <div className="panel" style={{ marginTop: 18 }}>
          <form action={replyTicketAction} className="form">
            <input type="hidden" name="id" value={ticket.id} />
            <label>{closed ? "Escribir otra vez (lo vuelve a abrir)" : "Responder"}<textarea name="body" required maxLength={5000} rows={4} /></label>
            <label>Foto o captura (opcional)<input name="photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /></label>
            <button className="btn">Enviar</button>
          </form>
          <form action={closeTicketAction} style={{ marginTop: 10 }}>
            <input type="hidden" name="id" value={ticket.id} />
            <button className="btn sm s">{closed ? "Abrir otra vez" : "Ya se resolvió: cerrar ticket"}</button>
          </form>
        </div>
      </div>
    </>
  );
}
