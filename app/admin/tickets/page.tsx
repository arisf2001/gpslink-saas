import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { TICKET_STATUS } from "@/lib/tickets";
import { AdminShell } from "../admin-shell";

export const dynamic = "force-dynamic";

const when = (d: Date) => d.toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santo_Domingo" });
const FILTERS = [["abierto", "Por responder"], ["respondido", "Respondidos"], ["cerrado", "Cerrados"], ["todos", "Todos"]] as const;

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  if (!(await getSession("admin"))) redirect("/admin");
  const asked = (await searchParams).ver;
  const ver = FILTERS.find(([k]) => k === asked)?.[0] ?? "abierto";
  const tickets = await prisma.supportTicket.findMany({
    where: ver === "todos" ? {} : { status: ver },
    orderBy: { updatedAt: ver === "abierto" ? "asc" : "desc" },
    take: 300,
    include: { company: { select: { id: true, name: true } }, _count: { select: { messages: true } } },
  });
  return (
    <AdminShell>
      <h1 className="page-title">Tickets de servicio</h1>
      <p className="hint">Los abren las marcas blancas desde su plataforma de rastreo (botón «Soporte») o desde su cuenta. Cuando respondes, les llega un correo.</p>
      <div className="tabs" style={{ justifyContent: "flex-start", margin: "10px 0" }}>
        {FILTERS.map(([k, label]) => <Link key={k} href={`/admin/tickets?ver=${k}`} className={`tab${ver === k ? " on" : ""}`}>{label}</Link>)}
      </div>
      <div className="panel">
        {tickets.length === 0 ? (
          <p className="hint">No hay tickets aquí.</p>
        ) : (
          <table className="t">
            <thead><tr><th>Marca</th><th>Asunto</th><th>Estado</th><th>Mensajes</th><th>Actualizado</th></tr></thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td>{t.company.name}</td>
                  <td><Link href={`/admin/tickets/${t.id}`} style={{ fontWeight: 700 }}>{t.subject}</Link></td>
                  <td>{TICKET_STATUS[t.status] ?? t.status}</td>
                  <td>{t._count.messages}</td>
                  <td>{when(t.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}
