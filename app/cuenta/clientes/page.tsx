import Link from "next/link";
import { requireTab } from "@/lib/tabs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { STATE_LABELS, clientState, syncClientsThrottled } from "@/lib/clients";
import { formatDate } from "@/lib/format";
import { getSession } from "@/lib/session";
import { SiteNav } from "../../site-nav";
import { CuentaNav } from "../cuenta-nav";
import { mockClientAction, syncClientsAction } from "./actions";

export const dynamic = "force-dynamic";


const FILTERS = { todos: "Todos", vencer: "Por vencer", bloqueados: "Bloqueados", "sin-plan": "Sin plan" } as const;

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ f?: string; ok?: string; error?: string }> }) {
  const companyId = await getSession("company");
  await requireTab("clientes");
  const company = companyId ? await prisma.company.findUnique({ where: { id: companyId } }) : null;
  if (!company) redirect("/cuenta");
  const { f = "todos", ok, error } = await searchParams;

  const syncError = !(await syncClientsThrottled(company));

  const now = new Date();
  const all = await prisma.endClient.findMany({ where: { companyId: company.id }, include: { plan: true }, orderBy: [{ goneAt: "asc" }, { email: "asc" }] });
  const byGpswoxId = new Map(all.map((c) => [c.gpswoxUserId, c]));
  const rows = all.filter((c) => {
    const s = clientState(c, now);
    if (f === "vencer") return s === "due_soon";
    if (f === "bloqueados") return s === "blocked";
    if (f === "sin-plan") return s === "no_plan";
    return f !== "todos" || s !== "gone" || all.length < 200;
  });
  const dealers = all.filter((c) => c.isDealer && !c.goneAt);
  const isMock = process.env.GPSWOX_MODE === "mock";

  return (
    <>
      <SiteNav />
      <div className="wrap" style={{ maxWidth: 1060, paddingBottom: 40 }}>
        <h1 className="page-title">Mis clientes</h1>
        <CuentaNav active="clientes" />
        <p className="hint" style={{ marginBottom: 12 }}>
          Aquí salen los clientes y dealers que creas en tu plataforma de rastreo. Ponle un plan y una fecha de vencimiento a cada uno: les avisamos por correo 3, 2 y 1 días antes, y si no pagan se bloquean solos. Cuando registras su pago, se reactivan. Los que no tienen plan nunca vencen.
        </p>
        {ok === "sync" && <div className="ok" style={{ marginBottom: 12 }}>Lista actualizada.</div>}
        {(error === "sync" || syncError) && <div className="err" style={{ marginBottom: 12 }}>No pudimos leer tus clientes de la plataforma de rastreo. Inténtalo en unos minutos.</div>}

        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <div className="tabs" style={{ margin: 0 }}>
            {Object.entries(FILTERS).map(([k, l]) => <Link key={k} href={`/cuenta/clientes?f=${k}`} className={`tab${f === k ? " on" : ""}`}>{l}</Link>)}
          </div>
          <form action={syncClientsAction}><button className="btn sm s">Actualizar desde la plataforma</button></form>
        </div>

        <div className="panel">
          <table className="t">
            <thead><tr><th>Cliente</th><th>Equipos</th><th>Plan</th><th>Vence</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="hint">{all.length === 0 ? "Todavía no tienes clientes. Créalos en tu plataforma de rastreo y aparecerán aquí." : "No hay clientes en este filtro."}</td></tr>}
              {rows.map((c) => {
                const [label, tag] = STATE_LABELS[clientState(c, now)];
                const dealer = c.managerId ? byGpswoxId.get(c.managerId) : null;
                return (
                  <tr key={c.id}>
                    <td>
                      {c.email} {c.isDealer && <span className="tag TRIAL">Dealer</span>}
                      {dealer && <div className="hint">Cliente de {dealer.email}</div>}
                    </td>
                    <td>{c.devices}</td>
                    <td>{c.plan?.name ?? "—"}</td>
                    <td>{c.plan ? formatDate(c.paidUntil) : "No vence"}</td>
                    <td><span className={`tag ${tag}`}>{label}</span></td>
                    <td><Link href={`/cuenta/clientes/${c.id}`} className="btn sm">Abrir</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {isMock && (
          <form action={mockClientAction} className="panel form" style={{ marginTop: 18 }}>
            <b>Simular cliente (modo prueba)</b>
            <label>Correo<input name="email" type="email" placeholder="cliente@ejemplo.com" /></label>
            <label>Equipos<input name="devices" type="number" min={0} max={50} defaultValue={2} /></label>
            <label>Debajo de
              <select name="under" defaultValue=""><option value="">Mi empresa</option>{dealers.map((d) => <option key={d.id} value={d.gpswoxUserId}>{d.email}</option>)}</select>
            </label>
            <label className="row"><input type="checkbox" name="dealer" style={{ width: "auto" }} /> Es dealer</label>
            <button className="btn sm s">Agregar</button>
          </form>
        )}
      </div>
    </>
  );
}
