import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { CATEGORY_LABELS, METHOD_LABELS, NOTIFICATION_LABELS, STATUS_LABELS, formatDate, formatMoney } from "@/lib/format";
import { accessEndsAt, daysLeft } from "@/lib/lifecycle";
import { getSession } from "@/lib/session";
import { blockAction, changePlanAction, extendAction, markPaidAction, unblockAction } from "../../actions";
import { AdminShell } from "../../admin-shell";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = { pago: "Pago registrado y cuenta activada.", bloqueada: "Empresa bloqueada.", desbloqueada: "Empresa desbloqueada.", extendida: "Fecha extendida.", plan: "Paquete cambiado." };
const ERR: Record<string, string> = { monto: "Monto no válido.", dias: "Días no válidos (1 a 400).", vencida: "Su fecha ya venció: registra un pago o extiende la fecha para desbloquearla." };

export default async function EmpresaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  if (!(await getSession("admin"))) redirect("/admin");
  const { id } = await params;
  const { ok, error } = await searchParams;
  const company = await prisma.company.findUnique({
    where: { id },
    include: { plan: true, payments: { orderBy: { createdAt: "desc" } }, notifications: { orderBy: { createdAt: "desc" }, take: 30 } },
  });
  if (!company) notFound();
  const plans = await prisma.plan.findMany({ orderBy: [{ sortOrder: "asc" }, { devices: "asc" }] });
  const blocked = company.status === "BLOCKED";

  return (
    <AdminShell>
      <h1 className="page-title">{company.name} <span className={`tag ${company.status}`} style={{ verticalAlign: "middle" }}>{STATUS_LABELS[company.status]}</span></h1>
      {ok && OK[ok] && <div className="ok" style={{ margin: "10px 0" }}>{OK[ok]}</div>}
      {error && ERR[error] && <div className="err" style={{ margin: "10px 0" }}>{ERR[error]}</div>}
      <div className="panel">
        <dl className="kv">
          <dt>Contacto</dt><dd>{company.contactName} · {company.email} · {company.phone}</dd>
          <dt>Código</dt><dd>{company.slug}</dd>
          <dt>Paquete</dt><dd>{CATEGORY_LABELS[company.plan.category]} · {company.plan.devices} equipos · {formatMoney(company.plan.priceCents, company.plan.currency)}/año</dd>
          <dt>Registrada</dt><dd>{formatDate(company.createdAt)}</dd>
          <dt>Prueba hasta</dt><dd>{formatDate(company.trialEndsAt)}</dd>
          <dt>Pagada hasta</dt><dd>{formatDate(company.paidUntil)}</dd>
          <dt>Vence</dt><dd>{formatDate(accessEndsAt(company))} {!blocked && `(${daysLeft(company, new Date())} días)`}</dd>
          <dt>Usuario en GPS Link</dt><dd>{company.gpswoxUserId ? `#${company.gpswoxUserId}` : "—"}</dd>
        </dl>
      </div>

      <div className="grid" style={{ marginTop: 18 }}>
        <form action={markPaidAction} className="panel form">
          <b>Registrar pago manual</b>
          <input type="hidden" name="companyId" value={company.id} />
          <label>Monto (USD)<input name="amount" defaultValue={(company.plan.priceCents / 100).toString()} inputMode="decimal" /></label>
          <label>Método<select name="method"><option value="deposito">Depósito / transferencia</option><option value="azul">Azul</option><option value="efectivo">Efectivo</option><option value="manual">Otro</option></select></label>
          <label>Nota<input name="note" /></label>
          <button className="btn">Registrar pago y activar 1 año</button>
        </form>
        <form action={extendAction} className="panel form">
          <b>Extender fecha</b>
          <input type="hidden" name="companyId" value={company.id} />
          <label>Días<input name="days" type="number" min={1} max={400} defaultValue={30} /></label>
          <span className="hint">Suma días a la prueba o al año pagado, sin cobro.</span>
          <button className="btn dark">Extender</button>
        </form>
        <div className="panel form">
          <b>Paquete y estado</b>
          <form action={changePlanAction} className="form">
            <input type="hidden" name="companyId" value={company.id} />
            <select name="planId" defaultValue={company.planId}>
              {plans.map((p) => <option key={p.id} value={p.id}>{CATEGORY_LABELS[p.category]} · {p.devices} equipos</option>)}
            </select>
            <button className="btn sm dark">Cambiar paquete</button>
          </form>
          <form action={blocked ? unblockAction : blockAction}>
            <input type="hidden" name="companyId" value={company.id} />
            <button className={`btn sm ${blocked ? "" : "red"}`}>{blocked ? "Desbloquear" : "Bloquear ahora"}</button>
          </form>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <b>Pagos</b>
        <table className="t" style={{ marginTop: 8 }}>
          <thead><tr><th>Fecha</th><th>Monto</th><th>Método</th><th>Período</th><th>Nota</th></tr></thead>
          <tbody>
            {company.payments.length === 0 && <tr><td colSpan={5} className="hint">Sin pagos.</td></tr>}
            {company.payments.map((p) => <tr key={p.id}><td>{formatDate(p.createdAt)}</td><td>{formatMoney(p.amountCents, p.currency)}</td><td>{METHOD_LABELS[p.method] ?? p.method}</td><td>{formatDate(p.periodStart)} – {formatDate(p.periodEnd)}</td><td>{p.note ?? ""}</td></tr>)}
          </tbody>
        </table>
      </div>
      <div className="panel" style={{ marginTop: 18 }}>
        <b>Avisos enviados</b>
        <table className="t" style={{ marginTop: 8 }}>
          <thead><tr><th>Fecha</th><th>Aviso</th><th>Enviado por</th><th>Error</th></tr></thead>
          <tbody>
            {company.notifications.length === 0 && <tr><td colSpan={4} className="hint">Sin avisos.</td></tr>}
            {company.notifications.map((n) => <tr key={n.id}><td>{formatDate(n.createdAt)}</td><td>{NOTIFICATION_LABELS[n.kind] ?? n.kind}</td><td>{n.channels || "—"}</td><td className="hint">{n.error ?? ""}</td></tr>)}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
