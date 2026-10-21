import Link from "next/link";
import { prisma } from "@/lib/db";
import { CATEGORY_LABELS, STATUS_LABELS, formatDate } from "@/lib/format";
import { daysUntil, slotIsActive, slotIsFree } from "@/lib/lifecycle";
import { getSession } from "@/lib/session";
import { runLifecycleAction } from "./actions";
import { AdminLogin } from "./admin-login";
import { AdminShell } from "./admin-shell";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; estado?: string }> }) {
  if (!(await getSession("admin"))) {
    return (
      <div className="wrap"><div className="panel narrow"><h1 style={{ fontSize: 22, marginBottom: 16 }}>Panel del dueño</h1><AdminLogin /></div></div>
    );
  }
  const { ok, estado } = await searchParams;
  const companies = await prisma.company.findMany({ include: { plan: true, slots: true }, orderBy: { createdAt: "desc" } });
  const counts = companies.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {});
  const list = estado ? companies.filter((c) => c.status === estado) : companies;
  const now = new Date();

  return (
    <AdminShell>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 className="page-title">Empresas ({companies.length})</h1>
        <form action={runLifecycleAction}><button className="btn sm dark">Revisar vencimientos ahora</button></form>
      </div>
      {ok && <div className="ok" style={{ margin: "10px 0" }}>{ok}</div>}
      <div className="row" style={{ margin: "12px 0" }}>
        <Link href="/admin" className={`tab${!estado ? " on" : ""}`}>Todas</Link>
        {Object.entries(STATUS_LABELS).map(([k, label]) => (
          <Link key={k} href={`/admin?estado=${k}`} className={`tab${estado === k ? " on" : ""}`}>{label} ({counts[k] ?? 0})</Link>
        ))}
      </div>
      <table className="t">
        <thead><tr><th>Empresa</th><th>Contacto</th><th>Paquete</th><th>Estado</th><th>Prueba / equipos</th><th>Días</th><th></th></tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--muted)" }}>Todavía no hay empresas.</td></tr>}
          {list.map((c) => (
            <tr key={c.id}>
              <td><b>{c.name}</b><div className="hint">{c.slug}</div></td>
              <td>{c.contactName}<div className="hint">{c.email} · {c.phone}</div></td>
              <td>{c.plan.devices} equipos<div className="hint">{CATEGORY_LABELS[c.plan.category]}</div></td>
              <td><span className={`tag ${c.status}`}>{STATUS_LABELS[c.status]}</span></td>
              <td>{c.slots.length ? `${c.slots.filter((s) => slotIsActive(s, now)).length} en uso de ${c.slots.filter((s) => slotIsActive(s, now) || slotIsFree(s, now)).length} pagados` : `Prueba hasta ${formatDate(c.trialEndsAt)}`}</td>
              <td>{c.status === "TRIAL" ? daysUntil(c.trialEndsAt, now) : "—"}</td>
              <td><Link href={`/admin/empresa/${c.id}`} className="btn sm s">Ver</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminShell>
  );
}
