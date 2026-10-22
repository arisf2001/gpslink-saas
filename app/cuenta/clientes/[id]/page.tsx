import Link from "next/link";
import { requireTab } from "@/lib/tabs";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PERIOD_LABELS, STATE_LABELS, addMonths, clientState, dateInputDR, suggestedAmount } from "@/lib/clients";
import { METHOD_LABELS, formatDate, formatMoney } from "@/lib/format";
import { getSession } from "@/lib/session";
import { SiteNav } from "../../../site-nav";
import { CuentaNav } from "../../cuenta-nav";
import { blockClientAction, clientPaymentAction, setClientPlanAction, unblockClientAction } from "../actions";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = { plan: "Plan guardado.", pago: "Pago registrado. Le enviamos el recibo por correo.", bloqueado: "Cliente bloqueado.", desbloqueado: "Cliente desbloqueado." };
const ERR: Record<string, string> = {
  plan: "Elige un plan y la fecha de vencimiento.",
  pago: "Revisa los datos del pago.",
  vencido: "Este cliente está vencido: registra su pago o cámbiale la fecha de vencimiento.",
};
const BLOCK_REASONS: Record<string, string> = { expired: "por falta de pago", manual: "a mano", dealer: "porque su dealer está bloqueado" };
const NOTICE_LABELS: Record<string, string> = { due_3: "Vence en 3 días", due_2: "Vence en 2 días", due_1: "Vence en 1 día", blocked: "Bloqueado por falta de pago", paid: "Recibo de pago" };

export default async function ClientePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const companyId = await getSession("company");
  await requireTab("clientes");
  if (!companyId) redirect("/cuenta");
  const { id } = await params;
  const { ok, error } = await searchParams;
  const client = await prisma.endClient.findFirst({
    where: { id, companyId },
    include: { plan: true, payments: { orderBy: { createdAt: "desc" } }, notices: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  if (!client) notFound();
  const now = new Date();
  const plans = await prisma.clientPlan.findMany({ where: { companyId, OR: [{ active: true }, { id: client.planId ?? "" }] }, orderBy: { createdAt: "asc" } });
  const [label, tag] = STATE_LABELS[clientState(client, now)];
  const defaultUntil = client.paidUntil ?? (client.plan ? addMonths(now, client.plan.months) : now);

  return (
    <>
      <SiteNav />
      <div className="wrap" style={{ maxWidth: 960, paddingBottom: 40 }}>
        <h1 className="page-title">{client.email} <span className={`tag ${tag}`} style={{ verticalAlign: "middle" }}>{label}</span></h1>
        <CuentaNav active="clientes" />
        <p style={{ marginBottom: 12 }}><Link href="/cuenta/clientes">← Volver a mis clientes</Link> · <Link href={`/cuenta/permisos?cliente=${client.id}`}>Qué ve este cliente en la plataforma</Link></p>
        {ok && OK[ok] && <div className="ok" style={{ marginBottom: 12 }}>{OK[ok]}</div>}
        {error && ERR[error] && <div className="err" style={{ marginBottom: 12 }}>{ERR[error]}</div>}

        <div className="panel">
          <dl className="kv">
            <dt>Tipo</dt><dd>{client.isDealer ? "Dealer (sus clientes también se bloquean si él se bloquea)" : "Cliente"}</dd>
            <dt>Equipos</dt><dd>{client.devices}</dd>
            <dt>Teléfono</dt><dd>{client.phone ?? "—"}</dd>
            <dt>Plan</dt><dd>{client.plan ? `${client.plan.name} · ${formatMoney(client.plan.priceCents, client.plan.currency)} por equipo · ${PERIOD_LABELS[client.plan.months] ?? `${client.plan.months} meses`}` : "Sin plan (no vence)"}</dd>
            <dt>Vence</dt><dd>{client.plan ? formatDate(client.paidUntil) : "No vence"}</dd>
            {client.blockReason && <><dt>Bloqueado</dt><dd>{BLOCK_REASONS[client.blockReason] ?? client.blockReason}</dd></>}
            {client.goneAt && <><dt>Eliminado</dt><dd>Ya no está en tu plataforma de rastreo (desde el {formatDate(client.goneAt)})</dd></>}
          </dl>
        </div>

        <div className="grid" style={{ marginTop: 18 }}>
          <form action={setClientPlanAction} className="panel form" style={{ alignContent: "start" }}>
            <b>Plan y vencimiento</b>
            <input type="hidden" name="clientId" value={client.id} />
            <label>Plan
              <select name="planId" defaultValue={client.planId ?? ""}>
                <option value="">Sin plan (no vence)</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatMoney(p.priceCents, p.currency)} · {PERIOD_LABELS[p.months]}</option>)}
              </select>
            </label>
            <label>Vence el<input name="paidUntil" type="date" defaultValue={dateInputDR(defaultUntil)} /></label>
            {plans.length === 0 && <span className="hint">Primero crea un plan en <Link href="/cuenta/planes">Mis planes</Link>.</span>}
            <button className="btn sm">Guardar</button>
          </form>

          {client.plan && (
            <form action={clientPaymentAction} className="panel form" style={{ alignContent: "start" }}>
              <b>Registrar pago</b>
              <input type="hidden" name="clientId" value={client.id} />
              <label>Periodos pagados ({PERIOD_LABELS[client.plan.months]?.toLowerCase()})<input name="periods" type="number" min={1} max={24} defaultValue={1} /></label>
              <label>Monto ({client.plan.currency === "dop" ? "RD$" : "US$"})<input name="amount" inputMode="decimal" defaultValue={(suggestedAmount(client.plan, client.devices) / 100).toFixed(2)} /></label>
              <span className="hint">Sugerido: {client.devices || 1} {client.devices === 1 ? "equipo" : "equipos"} × {formatMoney(client.plan.priceCents, client.plan.currency)}. La nueva fecha se suma desde que vence (o desde hoy si ya venció).</span>
              <label>Forma de pago
                <select name="method" defaultValue="efectivo">
                  <option value="efectivo">Efectivo</option>
                  <option value="deposito">Depósito / transferencia</option>
                  <option value="azul">Azul</option>
                  <option value="manual">Otro</option>
                </select>
              </label>
              <label>Nota<input name="note" maxLength={200} placeholder="Opcional" /></label>
              <button className="btn sm">Registrar pago</button>
            </form>
          )}

          <div className="panel form" style={{ alignContent: "start" }}>
            <b>{client.blockReason ? "Cliente bloqueado" : "Bloquear cliente"}</b>
            <span className="hint">{client.blockReason ? "Al desbloquearlo vuelve a entrar a la plataforma." : "No podrá entrar a la plataforma hasta que lo desbloquees."}</span>
            <form action={client.blockReason ? unblockClientAction : blockClientAction}>
              <input type="hidden" name="clientId" value={client.id} />
              <button className={`btn sm${client.blockReason ? "" : " dark"}`} disabled={!!client.goneAt}>{client.blockReason ? "Desbloquear" : "Bloquear"}</button>
            </form>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 18 }}>
          <b>Pagos</b>
          <table className="t" style={{ marginTop: 8 }}>
            <thead><tr><th>Fecha</th><th>Monto</th><th>Forma</th><th>Queda pagado hasta</th><th>Nota</th></tr></thead>
            <tbody>
              {client.payments.length === 0 && <tr><td colSpan={5} className="hint">Sin pagos registrados.</td></tr>}
              {client.payments.map((p) => <tr key={p.id}><td>{formatDate(p.createdAt)}</td><td>{formatMoney(p.amountCents, p.currency)}</td><td>{METHOD_LABELS[p.method] ?? p.method}</td><td>{formatDate(p.paidUntil)}</td><td className="hint">{p.note ?? ""}</td></tr>)}
            </tbody>
          </table>
        </div>

        <div className="panel" style={{ marginTop: 18 }}>
          <b>Avisos enviados</b>
          <table className="t" style={{ marginTop: 8 }}>
            <thead><tr><th>Fecha</th><th>Aviso</th><th>Enviado por</th></tr></thead>
            <tbody>
              {client.notices.length === 0 && <tr><td colSpan={3} className="hint">Sin avisos.</td></tr>}
              {client.notices.map((n) => <tr key={n.id}><td>{formatDate(n.createdAt)}</td><td>{NOTICE_LABELS[n.kind] ?? n.kind}</td><td>{n.channels || <span className="hint">No enviado{n.error ? `: ${n.error}` : ""}</span>}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
