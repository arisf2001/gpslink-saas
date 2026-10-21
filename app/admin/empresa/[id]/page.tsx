import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ADDON_DEVICES } from "@/lib/config";
import { dueSlots } from "@/lib/companies";
import { CATEGORY_LABELS, METHOD_LABELS, NOTIFICATION_LABELS, STATUS_LABELS, formatDate, formatMoney, paymentLabel } from "@/lib/format";
import { daysUntil, slotIsActive, slotIsFree } from "@/lib/lifecycle";
import { getSession } from "@/lib/session";
import { blockAction, changePlanAction, extendAction, markPaidAction, mockDeviceAction, unblockAction } from "../../actions";
import { AdminShell } from "../../admin-shell";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = { pago: "Pago registrado.", bloqueada: "Empresa bloqueada.", desbloqueada: "Empresa desbloqueada.", extendida: "Prueba extendida.", plan: "Paquete de prueba cambiado.", equipo: "Equipos de prueba agregados (modo prueba)." };
const ERR: Record<string, string> = { monto: "Monto no válido.", dias: "Días no válidos (1 a 400).", vencida: "La prueba ya venció y no tiene equipos pagados: registra un pago o extiende la prueba.", pagada: "Esta empresa ya pagó: se maneja por equipos, no por prueba." };

export default async function EmpresaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; msg?: string }> }) {
  if (!(await getSession("admin"))) redirect("/admin");
  const { id } = await params;
  const { ok, error, msg } = await searchParams;
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      plan: true,
      payments: { orderBy: { createdAt: "desc" } },
      notifications: { orderBy: { createdAt: "desc" }, take: 30 },
      slots: { orderBy: [{ endsAt: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!company) notFound();
  const [plans, prices] = await Promise.all([
    prisma.plan.findMany({ orderBy: [{ sortOrder: "asc" }, { devices: "asc" }] }),
    prisma.categoryPrice.findUnique({ where: { category: company.plan.category } }),
  ]);
  const now = new Date();
  const blocked = company.status === "BLOCKED";
  const hasSlots = company.slots.length > 0;
  const used = company.slots.filter((s) => slotIsActive(s, now)).length;
  const free = company.slots.filter((s) => slotIsFree(s, now)).length;
  const due = dueSlots(company.slots, now).length;
  const devices = company.slots.filter((s) => s.deviceId !== null);
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
          <dt>Categoría</dt><dd>{CATEGORY_LABELS[company.plan.category]}</dd>
          <dt>Registrada</dt><dd>{formatDate(company.createdAt)}</dd>
          {hasSlots ? (
            <><dt>Último paquete</dt><dd>{company.plan.devices} equipos</dd></>
          ) : (
            <><dt>Prueba</dt><dd>Hasta {formatDate(company.trialEndsAt)} con {company.plan.devices} equipos {company.status === "TRIAL" && `(${daysUntil(company.trialEndsAt, now)} días)`}</dd></>
          )}
          <dt>Equipos pagados</dt><dd>{hasSlots ? `${used + free} (${used} en uso · ${free} libres · ${due} por renovar en 30 días)` : "Todavía no ha pagado"}</dd>
          <dt>Límite en GPS Link</dt><dd>{company.gpswoxLimit ?? "—"}</dd>
          <dt>Usuario en GPS Link</dt><dd>{company.gpswoxUserId ? `#${company.gpswoxUserId}` : "—"}</dd>
        </dl>
      </div>

      <div className="grid" style={{ marginTop: 18 }}>
        <form action={markPaidAction} className="panel form">
          <b>Registrar pago manual</b>
          <input type="hidden" name="companyId" value={company.id} />
          <label>Qué pagó
            <select name="kind" defaultValue={hasSlots ? "renewal" : "plan"}>
              <option value="plan">Paquete</option>
              <option value="block">Bloques de {ADDON_DEVICES} equipos extra</option>
              <option value="renewal">Renovar equipos que vencen en 30 días ({due})</option>
            </select>
          </label>
          <label>Paquete (si pagó paquete)
            <select name="planId" defaultValue={company.planId}>
              {plans.filter((p) => p.category === company.plan.category).map((p) => <option key={p.id} value={p.id}>{p.devices} equipos · {formatMoney(p.priceCents, p.currency)}</option>)}
            </select>
          </label>
          <label>Bloques (si pagó equipos extra)<input name="blocks" type="number" min={1} max={100} defaultValue={1} /></label>
          <label>Monto (USD)<input name="amount" inputMode="decimal" required placeholder={prices?.renewalPriceCents ? `Renovación: ${formatMoney(prices.renewalPriceCents, prices.currency)} por equipo` : ""} /></label>
          <label>Método<select name="method"><option value="deposito">Depósito / transferencia</option><option value="azul">Azul</option><option value="efectivo">Efectivo</option><option value="manual">Otro</option></select></label>
          <label>Nota<input name="note" /></label>
          <button className="btn">Registrar pago</button>
        </form>
        {!hasSlots && (
          <div className="panel form">
            <b>Prueba gratis</b>
            <form action={extendAction} className="form">
              <input type="hidden" name="companyId" value={company.id} />
              <label>Días a sumar<input name="days" type="number" min={1} max={400} defaultValue={30} /></label>
              <button className="btn sm dark">Extender prueba</button>
            </form>
            <form action={changePlanAction} className="form">
              <input type="hidden" name="companyId" value={company.id} />
              <label>Equipos en la prueba
                <select name="planId" defaultValue={company.planId}>
                  {plans.map((p) => <option key={p.id} value={p.id}>{CATEGORY_LABELS[p.category]} · {p.devices} equipos</option>)}
                </select>
              </label>
              <button className="btn sm dark">Cambiar</button>
            </form>
          </div>
        )}
        <div className="panel form">
          <b>Estado</b>
          <form action={blocked ? unblockAction : blockAction}>
            <input type="hidden" name="companyId" value={company.id} />
            <button className={`btn sm ${blocked ? "" : "red"}`}>{blocked ? "Desbloquear" : "Bloquear ahora"}</button>
          </form>
          {isMock && (
            <form action={mockDeviceAction} className="form" style={{ marginTop: 12 }}>
              <input type="hidden" name="companyId" value={company.id} />
              <label>Modo prueba: simular equipos agregados hoy<input name="count" type="number" min={1} max={200} defaultValue={3} /></label>
              <button className="btn sm s">Agregar equipos de prueba</button>
            </form>
          )}
        </div>
      </div>

      {devices.length > 0 && (
        <div className="panel" style={{ marginTop: 18 }}>
          <b>Equipos pagados en uso</b>
          <table className="t" style={{ marginTop: 8 }}>
            <thead><tr><th>Equipo</th><th>Empezó</th><th>Vence</th><th>Días</th></tr></thead>
            <tbody>
              {devices.map((s) => <tr key={s.id}><td>#{s.deviceId}</td><td>{formatDate(s.startsAt)}</td><td>{formatDate(s.endsAt)}</td><td>{s.endsAt ? Math.max(daysUntil(s.endsAt, now), 0) : "—"}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel" style={{ marginTop: 18 }}>
        <b>Pagos</b>
        <table className="t" style={{ marginTop: 8 }}>
          <thead><tr><th>Fecha</th><th>Concepto</th><th>Monto</th><th>Método</th><th>Nota</th></tr></thead>
          <tbody>
            {company.payments.length === 0 && <tr><td colSpan={5} className="hint">Sin pagos.</td></tr>}
            {company.payments.map((p) => <tr key={p.id}><td>{formatDate(p.createdAt)}</td><td>{paymentLabel(p)}</td><td>{formatMoney(p.amountCents, p.currency)}</td><td>{METHOD_LABELS[p.method] ?? p.method}</td><td>{p.note ?? ""}</td></tr>)}
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
