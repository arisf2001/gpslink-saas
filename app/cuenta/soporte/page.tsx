import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getSession } from "@/lib/session";
import { TICKET_STATUS } from "@/lib/tickets";
import { SiteNav } from "../../site-nav";
import { TICKET_ERR } from "../../ticket-thread";
import { CuentaNav } from "../cuenta-nav";
import { createTicketAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SoportePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const companyId = await getSession("company");
  if (!companyId) redirect("/cuenta");
  const company = await prisma.company.findUnique({ where: { id: companyId }, include: { tickets: { orderBy: { updatedAt: "desc" }, take: 100 } } });
  if (!company) redirect("/cuenta");
  const { error } = await searchParams;
  return (
    <>
      <SiteNav />
      <div className="wrap" style={{ maxWidth: 860, paddingBottom: 40 }}>
        <h1 className="page-title">{company.name}</h1>
        <CuentaNav active="soporte" />
        {error && TICKET_ERR[error] && <div className="err" role="alert" style={{ marginBottom: 12 }}>{TICKET_ERR[error]}</div>}

        <div className="panel">
          <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 10 }}>Abrir un ticket de servicio</h2>
          <form action={createTicketAction} className="form">
            <label>Asunto<input name="subject" required minLength={3} maxLength={150} placeholder="Ej.: Un equipo no reporta" /></label>
            <label>Vehículo o IMEI (opcional)<input name="device" maxLength={120} /></label>
            <label>Mensaje<textarea name="body" required maxLength={5000} rows={5} placeholder="Cuéntanos qué pasa" /></label>
            <label>Foto o captura (opcional)<input name="photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /></label>
            <button className="btn">Enviar ticket</button>
          </form>
          <p className="hint" style={{ marginTop: 8 }}>GPS Link te responde aquí y te avisa por correo.</p>
        </div>

        <div className="panel" style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 10 }}>Mis tickets</h2>
          {company.tickets.length === 0 ? (
            <p className="hint">Todavía no has abierto tickets.</p>
          ) : (
            <table className="t">
              <thead><tr><th>Asunto</th><th>Estado</th><th>Última actualización</th></tr></thead>
              <tbody>
                {company.tickets.map((t) => (
                  <tr key={t.id}>
                    <td><Link href={`/cuenta/soporte/${t.id}`} style={{ color: "var(--p)", fontWeight: 700 }}>{t.subject}</Link></td>
                    <td>{TICKET_STATUS[t.status] ?? t.status}</td>
                    <td>{formatDate(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
