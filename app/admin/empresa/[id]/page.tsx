import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { METHOD_LABELS, NOTIFICATION_LABELS, STATUS_LABELS, formatDate, formatMoney } from "@/lib/format";
import { DAY_MS } from "@/lib/config";
import { daysUntil } from "@/lib/lifecycle";
import { getSession } from "@/lib/session";
import { blockAction, extendAction, markInvoicePaidAction, mockDeviceAction, setBillingAction, setLimitAction, unblockAction } from "../../actions";
import { AdminShell } from "../../admin-shell";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = { pago: "Pago registrado.", bloqueada: "Empresa bloqueada.", desbloqueada: "Empresa desbloqueada.", extendida: "Prueba extendida.", limite: "Límite de equipos cambiado.", equipo: "Equipos de prueba agregados (modo prueba).", "cobro-on": "Cobro activado.", "cobro-off": "Cobro desactivado." };
const ERR: Record<string, string> = { dias: "Días no válidos (1 a 400).", limite: "Límite no válido.", vencida: "Tiene facturas vencidas sin pagar: registra el pago primero." };

export default async function EmpresaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; msg?: string }> }) {
  if (!(await getSession("admin"))) redirect("/admin");
  const { id } = await params;
  const { ok, error, msg } = await searchParams;
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      invoices: { orderBy: { periodStart: "desc" } },
      notifications: { orderBy: { createdAt: "desc" }, take: 30 },
      devices: { orderBy: { addedAt: "asc" } },
    },
  });
  if (!company) notFound();
  const now = new Date();
  const blocked = company.status === "BLOCKED";
  const active = company.devices.filter((d) => !d.removedAt);
  const isMock = process.env.GPSWOX_MODE === "mock";

  return (
    <AdminShell>
      <h1 className="page-title">{company.name} <span className={`tag ${company.status}`} style={{ verticalAlign: "middle" }}>{STATUS_LABELS[company.status]}</span></h1>
      {ok && OK[ok] && <div className="ok" style={{ margin: "10px 0" }}>{OK[ok]}</div>}
      {error && ERR[error] && <div className="err" style={{ margin: "10px 0" }}>{ERR[error]}</div>}
      {msg && <div className="err" style={{ margin: "10px 0" }}>{msg}</div>}
      <div className="panel">
        <dl className="kv">
          <dt>Contacto</dt><dd>{company.contactName} · {company.email} · {company.phone}</dd>
          <dt>Código</dt><dd>{company.slug}</dd>
          <dt>Registrada</dt><dd>{formatDate(company.createdAt)}</dd>
          <dt>Prueba gratis</dt><dd>{company.billingEnabled ? <>Hasta {formatDate(company.trialEndsAt)}{company.status === "TRIAL" && ` (${daysUntil(company.trialEndsAt, now)} días)`}</> : "—"}</dd>
          <dt>Cobro</dt><dd>{company.billingEnabled ? "Activo: factura a fin de mes" : "Desactivado: ya estaba en GPS Link y entró con su usuario de la plataforma"}</dd>
          <dt>Equipos</dt><dd>{active.length} de {company.deviceLimit} permitidos</dd>
          <dt>Usuario en GPS Link</dt><dd>{company.gpswoxUserId ? `#${company.gpswoxUserId}` : "—"}</dd>
          {company.provisionError && <><dt>Error GPS Link</dt><dd className="hint">{company.provisionError}</dd></>}
        </dl>
      </div>

      <div className="grid" style={{ marginTop: 18 }}>
        <form action={setBillingAction} className="panel form">
          <b>Cobro de GPS Link</b>
          <input type="hidden" name="companyId" value={company.id} />
          <input type="hidden" name="on" value={company.billingEnabled ? "0" : "1"} />
          <p className="hint">{company.billingEnabled ? "Si lo desactivas, no se le crean facturas ni se bloquea por falta de pago." : "Al activarlo, sus equipos actuales entran en la factura de fin de este mes, y la IA también si la tiene activa."}</p>
          <button className={`btn sm${company.billingEnabled ? " s" : ""}`}>{company.billingEnabled ? "Desactivar cobro" : "Activar cobro"}</button>
        </form>
        {company.billingEnabled && <form action={setLimitAction} className="panel form">
          <b>Límite de equipos</b>
          <input type="hidden" name="companyId" value={company.id} />
          <label>Máximo de equipos<input name="limit" type="number" min={1} defaultValue={company.deviceLimit} /></label>
          <button className="btn sm">Guardar límite</button>
        </form>}
        {company.status === "TRIAL" && (
          <form action={extendAction} className="panel form">
            <b>Extender prueba</b>
            <input type="hidden" name="companyId" value={company.id} />
            <label>Días<input name="days" type="number" min={1} max={400} defaultValue={30} /></label>
            <button className="btn sm s">Extender</button>
          </form>
        )}
        <div className="panel form">
          <b>{blocked ? "Cuenta bloqueada" : "Bloquear cuenta"}</b>
          <form action={blocked ? unblockAction : blockAction}>
            <input type="hidden" name="companyId" value={company.id} />
            <button className={`btn sm${blocked ? "" : " dark"}`}>{blocked ? "Desbloquear" : "Bloquear"}</button>
          </form>
        </div>
        {isMock && (
          <form action={mockDeviceAction} className="panel form">
            <b>Simular equipos (modo prueba)</b>
            <input type="hidden" name="companyId" value={company.id} />
            <label>Cantidad<input name="count" type="number" min={1} max={200} defaultValue={3} /></label>
            <button className="btn sm s">Agregar equipos</button>
          </form>
        )}
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <b>Facturas</b>
        <table className="t" style={{ marginTop: 8 }}>
          <thead><tr><th>Mes</th><th>Equipos</th><th>Precio c/u</th><th>Total</th><th>Vence</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {company.invoices.length === 0 && <tr><td colSpan={7} className="hint">Sin facturas todavía.</td></tr>}
            {company.invoices.map((inv) => (
              <tr key={inv.id}>
                <td>{formatDate(inv.periodStart)} – {formatDate(new Date(inv.periodEnd.getTime() - DAY_MS))}</td>
                <td>{inv.devices}<div className="hint">{inv.newDevices} nuevos · {inv.renewals} renovaciones</div></td>
                <td>{formatMoney(inv.unitPriceCents, inv.currency)}</td>
                <td><b>{formatMoney(inv.amountCents, inv.currency)}</b></td>
                <td>{formatDate(new Date(inv.dueAt.getTime() - DAY_MS))}</td>
                <td>{inv.status === "PAID" ? `Pagada ${formatDate(inv.paidAt)} · ${METHOD_LABELS[inv.method ?? ""] ?? inv.method}` : inv.dueAt < now ? "Vencida" : "Pendiente"}</td>
                <td>
                  {inv.status === "OPEN" && (
                    <form action={markInvoicePaidAction} className="row">
                      <input type="hidden" name="invoiceId" value={inv.id} />
                      <select name="method" defaultValue="deposito" aria-label="Método">
                        <option value="deposito">Depósito / transferencia</option>
                        <option value="azul">Azul</option>
                        <option value="efectivo">Efectivo</option>
                        <option value="manual">Otro</option>
                      </select>
                      <input name="note" placeholder="Nota" style={{ width: 110 }} />
                      <button className="btn sm">Marcar pagada</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <b>Equipos ({active.length})</b>
        <table className="t" style={{ marginTop: 8 }}>
          <thead><tr><th>Equipo</th><th>Subido</th><th>Próximo cobro</th><th>Estado</th></tr></thead>
          <tbody>
            {company.devices.length === 0 && <tr><td colSpan={4} className="hint">Todavía no ha subido equipos.</td></tr>}
            {company.devices.map((d) => <tr key={d.id}><td>#{d.deviceId}</td><td>{formatDate(d.addedAt)}</td><td>{d.removedAt ? "—" : formatDate(d.nextBillAt)}</td><td>{d.removedAt ? `Eliminado ${formatDate(d.removedAt)}` : "Activo"}</td></tr>)}
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
