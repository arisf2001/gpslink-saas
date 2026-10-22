import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { TICKET_STATUS } from "@/lib/tickets";
import { AdminShell } from "../../admin-shell";
import { TICKET_ERR, TicketThread } from "../../../ticket-thread";
import { adminReplyAction, adminStatusAction } from "../actions";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = {
  enviado: "Respuesta enviada. Le avisamos por correo a la marca.",
  "sin-correo": "Respuesta guardada, pero no se pudo enviar el correo a la marca. La ve en su cuenta.",
  cerrado: "Ticket cerrado.",
  reabierto: "Ticket abierto otra vez.",
};

export default async function AdminTicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  if (!(await getSession("admin"))) redirect("/admin");
  const { id } = await params;
  const ticket = await prisma.supportTicket.findUnique({ where: { id }, include: { company: { select: { id: true, name: true, email: true, phone: true } }, messages: { orderBy: { createdAt: "asc" } } } });
  if (!ticket) redirect("/admin/tickets");
  const { ok, error } = await searchParams;
  const closed = ticket.status === "cerrado";
  return (
    <AdminShell>
      <p style={{ marginTop: 14 }}><Link href="/admin/tickets">← Tickets</Link></p>
      <h1 className="page-title" style={{ textAlign: "left" }}>{ticket.subject}</h1>
      <p className="hint">
        <Link href={`/admin/empresa/${ticket.company.id}`}><b>{ticket.company.name}</b></Link> · {ticket.company.email} · {ticket.company.phone} · {TICKET_STATUS[ticket.status] ?? ticket.status}
        {ticket.device ? ` · Vehículo: ${ticket.device}` : ""}
      </p>
      {ok && OK[ok] && <div className="ok" style={{ margin: "10px 0" }}>{OK[ok]}</div>}
      {error && TICKET_ERR[error] && <div className="err" role="alert" style={{ margin: "10px 0" }}>{TICKET_ERR[error]}</div>}
      <div className="panel"><TicketThread messages={ticket.messages} /></div>
      <div className="panel" style={{ marginTop: 14 }}>
        <form action={adminReplyAction} className="form">
          <input type="hidden" name="id" value={ticket.id} />
          <label>Responder a {ticket.company.name}<textarea name="body" required maxLength={5000} rows={4} /></label>
          <label>Foto o captura (opcional)<input name="photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /></label>
          <button className="btn dark">Enviar respuesta</button>
        </form>
        <form action={adminStatusAction} style={{ marginTop: 10 }}>
          <input type="hidden" name="id" value={ticket.id} />
          <button className="btn sm s">{closed ? "Abrir otra vez" : "Cerrar ticket"}</button>
        </form>
      </div>
    </AdminShell>
  );
}
