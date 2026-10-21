import { prisma } from "@/lib/db";
import { applyCheckoutSession } from "@/lib/checkout";
import { ADDON_DEVICES, BRAND, RENEWAL_WINDOW_DAYS } from "@/lib/config";
import { dueSlots } from "@/lib/companies";
import { CATEGORY_LABELS, METHOD_LABELS, STATUS_LABELS, formatDate, formatMoney, paymentLabel } from "@/lib/format";
import { resellerLoginUrl } from "@/lib/gpswox";
import { daysUntil, slotIsActive, slotIsFree } from "@/lib/lifecycle";
import { getSession } from "@/lib/session";
import { getStripe } from "@/lib/stripe";
import { SiteNav } from "../site-nav";
import { logoutAction, payAction } from "./actions";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

type Search = { bienvenido?: string; pago?: string; session_id?: string };

export default async function CuentaPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const companyId = await getSession("company");

  if (!companyId) {
    return (
      <>
        <SiteNav />
        <div className="wrap">
          <div className="panel narrow">
            <h1 style={{ fontSize: 24, marginBottom: 18 }}>Entrar a mi cuenta</h1>
            <LoginForm />
          </div>
        </div>
      </>
    );
  }

  let paymentNotice: string | null = null;
  if (params.pago === "ok" && params.session_id) {
    const stripe = getStripe();
    const session = stripe ? await stripe.checkout.sessions.retrieve(params.session_id).catch(() => null) : null;
    if (session?.metadata?.companyId === companyId) {
      paymentNotice = (await applyCheckoutSession(session)) ? "¡Pago recibido! Gracias." : "Estamos confirmando tu pago. Recarga en un minuto.";
    }
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { plan: true, payments: { orderBy: { createdAt: "desc" } }, slots: { orderBy: [{ endsAt: "asc" }, { createdAt: "asc" }] } },
  });
  if (!company) return <LoginForm />;
  const now = new Date();
  const [plans, prices] = await Promise.all([
    prisma.plan.findMany({ where: { active: true, category: company.plan.category, priceCents: { gt: 0 } }, orderBy: { devices: "asc" } }),
    prisma.categoryPrice.findUnique({ where: { category: company.plan.category } }),
  ]);
  const stripeOn = !!process.env.STRIPE_SECRET_KEY;
  const trialLeft = daysUntil(company.trialEndsAt, now);
  const used = company.slots.filter((s) => slotIsActive(s, now));
  const free = company.slots.filter((s) => slotIsFree(s, now));
  const devices = company.slots.filter((s) => s.deviceId !== null);
  const due = dueSlots(company.slots, now);
  const hasSlots = company.slots.length > 0;
  const contact = `escríbenos a ${BRAND.supportEmail}${BRAND.supportWhatsApp ? ` o al WhatsApp ${BRAND.supportWhatsApp}` : ""}`;

  return (
    <>
      <SiteNav />
      <div className="wrap" style={{ maxWidth: 860, paddingBottom: 40 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1 className="page-title">{company.name}</h1>
          <form action={logoutAction}><button className="btn sm s">Salir</button></form>
        </div>
        <div style={{ display: "grid", gap: 12, margin: "12px 0" }}>
          {params.bienvenido && <div className="ok">¡Listo! Tu plataforma de rastreo ya está creada. Te enviamos los datos por correo y WhatsApp.</div>}
          {paymentNotice && <div className="ok">{paymentNotice}</div>}
          {params.pago === "cancelado" && <div className="warn">El pago se canceló. Puedes intentarlo de nuevo cuando quieras.</div>}
          {params.pago === "no-disponible" && <div className="warn">El pago en línea todavía no está disponible para esto. Para pagar, {contact}.</div>}
          {company.status === "BLOCKED" && <div className="err">Tu plataforma está bloqueada. Paga tu paquete para reactivarla al momento.</div>}
          {company.status === "TRIAL" && trialLeft <= 3 && trialLeft > 0 && <div className="warn">Te {trialLeft === 1 ? "queda 1 día" : `quedan ${trialLeft} días`} de prueba. Elige tu paquete para no ser bloqueado.</div>}
          {due.length > 0 && <div className="warn">{due.length} {due.length === 1 ? "equipo vence" : "equipos vencen"} en los próximos {RENEWAL_WINDOW_DAYS} días o ya vencieron.</div>}
        </div>

        <div className="panel">
          <dl className="kv">
            <dt>Estado</dt><dd><span className={`tag ${company.status}`}>{STATUS_LABELS[company.status]}</span></dd>
            {hasSlots ? (
              <>
                <dt>Equipos pagados</dt><dd>{used.length + free.length} ({used.length} en uso · {free.length} libres)</dd>
                <dt>Por renovar</dt><dd>{due.length} en los próximos {RENEWAL_WINDOW_DAYS} días</dd>
              </>
            ) : (
              <>
                <dt>Prueba gratis hasta</dt><dd>{formatDate(company.trialEndsAt)}</dd>
                <dt>Equipos en la prueba</dt><dd>Hasta {company.plan.devices} ({CATEGORY_LABELS[company.plan.category]})</dd>
              </>
            )}
            <dt>Código de empresa</dt><dd><b>{company.slug}</b></dd>
            <dt>Tu plataforma</dt><dd><a href={resellerLoginUrl()} target="_blank" rel="noreferrer" style={{ color: "var(--p)", fontWeight: 700 }}>{resellerLoginUrl()}</a><div className="hint">Entra con tu correo ({company.email}) y tu contraseña. Ahí pones tu logo y colores, y creas tus clientes.</div></dd>
          </dl>
        </div>

        <div className="panel" style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 6 }}>{hasSlots ? "Comprar más equipos" : "Elige tu paquete"}</h2>
          <p className="hint" style={{ marginBottom: 12 }}>Cada equipo cuenta su año desde el día en que lo agregas. Los equipos que ya tienes empiezan el día del pago.</p>
          {stripeOn && plans.length > 0 ? (
            <form action={payAction} className="row">
              <input type="hidden" name="kind" value="plan" />
              <select name="planId" style={{ width: "auto" }} defaultValue={plans.find((p) => p.devices >= company.plan.devices)?.id ?? plans[0].id}>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.devices} equipos · {formatMoney(p.priceCents, p.currency)}</option>)}
              </select>
              <button className="btn sm">Pagar paquete</button>
            </form>
          ) : (
            <p className="hint">Para pagar tu paquete, {contact}. Lo activamos en cuanto confirmemos el pago.</p>
          )}
          {hasSlots && company.status !== "BLOCKED" && stripeOn && !!prices?.blockPriceCents && (
            <form action={payAction} className="row" style={{ marginTop: 12 }}>
              <input type="hidden" name="kind" value="block" />
              <select name="blocks" style={{ width: "auto" }}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n * ADDON_DEVICES} equipos extra · {formatMoney(prices.blockPriceCents * n, prices.currency)}</option>)}
              </select>
              <button className="btn sm s">Comprar equipos extra</button>
            </form>
          )}
          {due.length > 0 && stripeOn && !!prices?.renewalPriceCents && (
            <form action={payAction} style={{ marginTop: 12 }}>
              <input type="hidden" name="kind" value="renewal" />
              <button className="btn sm">Renovar {due.length} {due.length === 1 ? "equipo" : "equipos"} · {formatMoney(prices.renewalPriceCents * due.length, prices.currency)}</button>
            </form>
          )}
        </div>

        {devices.length > 0 && (
          <div className="panel" style={{ marginTop: 18 }}>
            <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 10 }}>Tus equipos</h2>
            <table className="t">
              <thead><tr><th>Equipo</th><th>Empezó</th><th>Vence</th><th>Estado</th></tr></thead>
              <tbody>
                {devices.map((s) => {
                  const left = s.endsAt ? daysUntil(s.endsAt, now) : 0;
                  return <tr key={s.id}><td>#{s.deviceId}</td><td>{formatDate(s.startsAt)}</td><td>{formatDate(s.endsAt)}</td><td>{left <= 0 ? "Vencido" : left <= RENEWAL_WINDOW_DAYS ? `Vence en ${left} días` : "Activo"}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        )}

        {company.payments.length > 0 && (
          <div className="panel" style={{ marginTop: 18 }}>
            <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 10 }}>Pagos</h2>
            <table className="t">
              <thead><tr><th>Fecha</th><th>Concepto</th><th>Monto</th><th>Método</th></tr></thead>
              <tbody>
                {company.payments.map((p) => (
                  <tr key={p.id}><td>{formatDate(p.createdAt)}</td><td>{paymentLabel(p)}</td><td>{formatMoney(p.amountCents, p.currency)}</td><td>{METHOD_LABELS[p.method] ?? p.method}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
