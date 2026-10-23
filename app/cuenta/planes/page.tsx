import { redirect } from "next/navigation";
import { requireTab } from "@/lib/tabs";
import { prisma } from "@/lib/db";
import { PERIOD_LABELS } from "@/lib/clients";
import { getSession } from "@/lib/session";
import { SiteNav } from "../../site-nav";
import { savePlanAction } from "../clientes/actions";
import { CuentaNav } from "../cuenta-nav";

export const dynamic = "force-dynamic";

function PlanFields({ plan }: { plan?: { name: string; priceCents: number; currency: string; months: number } }) {
  return (
    <>
      <label>Nombre<input name="name" required maxLength={80} defaultValue={plan?.name} placeholder="Ej. Plan anual" /></label>
      <label>Precio por equipo<input name="price" required inputMode="decimal" defaultValue={plan ? (plan.priceCents / 100).toFixed(2) : ""} placeholder="395.00" /></label>
      <label>Moneda
        <select name="currency" defaultValue={plan?.currency ?? "usd"}><option value="usd">US$ (dólares)</option><option value="dop">RD$ (pesos)</option></select>
      </label>
      <label>Cada cuánto paga
        <select name="months" defaultValue={plan?.months ?? 12}>{Object.entries(PERIOD_LABELS).map(([m, l]) => <option key={m} value={m}>{l}</option>)}</select>
      </label>
    </>
  );
}

export default async function PlanesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const companyId = await getSession("company");
  await requireTab("planes");
  if (!companyId) redirect("/cuenta");
  const { ok, error } = await searchParams;
  const plans = await prisma.clientPlan.findMany({ where: { companyId }, orderBy: [{ active: "desc" }, { createdAt: "asc" }], include: { _count: { select: { clients: true } } } });

  return (
    <>
      <SiteNav />
      <div className="wrap" style={{ maxWidth: 960, paddingBottom: 40 }}>
        <h1 className="page-title">Mis planes</h1>
        <CuentaNav active="planes" />
        <p className="hint" style={{ marginBottom: 12 }}>Son los planes que les vendes a tus clientes y dealers. El precio es por cada equipo, desde 1. Después, en &quot;Mis clientes&quot;, le pones un plan a cada uno.</p>
        {ok && <div className="ok" style={{ marginBottom: 12 }}>Plan guardado.</div>}
        {error && <div className="err" style={{ marginBottom: 12 }}>Revisa los datos: nombre, precio mayor que 0, moneda y cada cuánto paga.</div>}

        <form action={savePlanAction} className="panel form" style={{ marginBottom: 18 }}>
          <b>Nuevo plan</b>
          <PlanFields />
          <button className="btn sm">Crear plan</button>
        </form>

        {plans.length === 0 ? <p className="hint">Todavía no tienes planes.</p> : (
          <div className="grid">
            {plans.map((p) => (
              <form key={p.id} action={savePlanAction} className="panel form">
                <b>{p.name} {!p.active && <span className="tag CANCELED">Inactivo</span>}</b>
                <span className="hint">{p._count.clients} {p._count.clients === 1 ? "cliente" : "clientes"}</span>
                <input type="hidden" name="id" value={p.id} />
                <PlanFields plan={p} />
                <label className="row"><input type="checkbox" name="active" defaultChecked={p.active} style={{ width: "auto" }} /> Activo (se puede elegir)</label>
                <button className="btn sm s">Guardar</button>
              </form>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
