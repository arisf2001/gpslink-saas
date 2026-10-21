import { prisma } from "@/lib/db";
import { applyCheckoutSession } from "@/lib/checkout";
import { BRAND } from "@/lib/config";
import { CATEGORY_LABELS, METHOD_LABELS, STATUS_LABELS, formatDate, formatMoney } from "@/lib/format";
import { resellerLoginUrl } from "@/lib/gpswox";
import { accessEndsAt, daysLeft } from "@/lib/lifecycle";
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
      paymentNotice = (await applyCheckoutSession(session)) ? "¡Pago recibido! Tu plataforma está activa por un año." : "Estamos confirmando tu pago. Recarga en un minuto.";
    }
  }

  const company = await prisma.company.findUnique({ where: { id: companyId }, include: { plan: true, payments: { orderBy: { createdAt: "desc" } } } });
  if (!company) return <LoginForm />;
  const now = new Date();
  const left = daysLeft(company, now);
  const canPay = company.plan.priceCents > 0 && !!process.env.STRIPE_SECRET_KEY;

  return (
    <>
      <SiteNav />
      <div className="wrap" style={{ maxWidth: 820, paddingBottom: 40 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1 className="page-title">{company.name}</h1>
          <form action={logoutAction}><button className="btn sm s">Salir</button></form>
        </div>
        <div style={{ display: "grid", gap: 12, margin: "12px 0" }}>
          {params.bienvenido && <div className="ok">¡Listo! Tu plataforma de rastreo ya está creada. Te enviamos los datos por correo y WhatsApp.</div>}
          {paymentNotice && <div className="ok">{paymentNotice}</div>}
          {params.pago === "cancelado" && <div className="warn">El pago se canceló. Puedes intentarlo de nuevo cuando quieras.</div>}
          {params.pago === "no-disponible" && <div className="warn">El pago en línea todavía no está disponible para tu paquete. Contáctanos.</div>}
          {company.status === "BLOCKED" && <div className="err">Tu plataforma está bloqueada por falta de pago. Paga el año para reactivarla al momento.</div>}
          {company.status !== "BLOCKED" && left <= 3 && left > 0 && <div className="warn">Te {left === 1 ? "queda 1 día" : `quedan ${left} días`}. Paga el año para no ser bloqueado.</div>}
        </div>

        <div className="panel">
          <dl className="kv">
            <dt>Estado</dt><dd><span className={`tag ${company.status}`}>{STATUS_LABELS[company.status]}</span></dd>
            <dt>Paquete</dt><dd>{CATEGORY_LABELS[company.plan.category]} · {company.plan.devices} equipos GPS</dd>
            <dt>Precio anual</dt><dd>{company.plan.priceCents > 0 ? formatMoney(company.plan.priceCents, company.plan.currency) : "Por definir"}</dd>
            <dt>{company.status === "TRIAL" ? "Prueba gratis hasta" : company.status === "BLOCKED" ? "Venció el" : "Activa hasta"}</dt><dd>{formatDate(accessEndsAt(company))}</dd>
            <dt>Código de empresa</dt><dd><b>{company.slug}</b></dd>
            <dt>Tu plataforma</dt><dd><a href={resellerLoginUrl()} target="_blank" rel="noreferrer" style={{ color: "var(--p)", fontWeight: 700 }}>{resellerLoginUrl()}</a><div className="hint">Entra con tu correo ({company.email}) y tu contraseña. Ahí pones tu logo y colores, y creas tus clientes.</div></dd>
          </dl>
          {canPay ? (
            <form action={payAction}>
              <button className="btn">{company.status === "TRIAL" ? "Pagar el año ahora" : company.status === "BLOCKED" ? "Pagar y reactivar" : "Pagar el próximo año"} · {formatMoney(company.plan.priceCents, company.plan.currency)}</button>
              {company.status === "TRIAL" && <p className="hint" style={{ marginTop: 8 }}>Si pagas antes, no pierdes los días de prueba que te quedan: el año empieza cuando termina la prueba.</p>}
            </form>
          ) : (
            <p className="hint">Para pagar tu año escríbenos a {BRAND.supportEmail}{BRAND.supportWhatsApp ? ` o al WhatsApp ${BRAND.supportWhatsApp}` : ""}. Activamos tu cuenta en cuanto confirmemos el pago.</p>
          )}
        </div>

        {company.payments.length > 0 && (
          <div className="panel" style={{ marginTop: 18 }}>
            <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 10 }}>Pagos</h2>
            <table className="t">
              <thead><tr><th>Fecha</th><th>Monto</th><th>Método</th><th>Período</th></tr></thead>
              <tbody>
                {company.payments.map((p) => (
                  <tr key={p.id}><td>{formatDate(p.createdAt)}</td><td>{formatMoney(p.amountCents, p.currency)}</td><td>{METHOD_LABELS[p.method] ?? p.method}</td><td>{formatDate(p.periodStart)} – {formatDate(p.periodEnd)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
