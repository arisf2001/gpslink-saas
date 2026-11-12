import { prisma } from "@/lib/db";
import { applyCheckoutSession } from "@/lib/checkout";
import { BRAND } from "@/lib/config";
import { METHOD_LABELS, STATUS_LABELS, formatDate, formatMoney } from "@/lib/format";
import { companyPlatformOrigin } from "@/lib/brand-web";
import { daysUntil } from "@/lib/lifecycle";
import { getSession, getStaffId } from "@/lib/session";
import { redirect } from "next/navigation";
import { accountLoginUrl, brandForHost } from "@/lib/brand-host";
import { getStripe } from "@/lib/stripe";
import { SiteNav } from "../site-nav";
import { logoutAction, payAction, removeCardAction, saveCardAction } from "./actions";
import { cardLabel } from "@/lib/company-card";
import { CuentaNav } from "./cuenta-nav";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

type Search = { bienvenido?: string; pago?: string; session_id?: string; tarjeta?: string; motivo?: string };

export default async function CuentaPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const companyId = await getSession("company");

  if (!companyId) {
    if (await brandForHost()) redirect("/entrar");
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

  if (params.tarjeta === "ok" && params.session_id) {
    const stripe = getStripe();
    const session = stripe ? await stripe.checkout.sessions.retrieve(params.session_id).catch(() => null) : null;
    if (session?.metadata?.companyId === companyId) {
      paymentNotice = (await applyCheckoutSession(session)) ? "Tarjeta guardada. Tus facturas se cobrarán solas a esta tarjeta." : "Estamos confirmando tu tarjeta. Recarga en un minuto.";
    }
  }
  if (params.tarjeta === "quitada") paymentNotice = "Quitamos tu tarjeta. Tus facturas ya no se cobrarán solas.";
  if (params.pago === "tarjeta") paymentNotice = "¡Pago recibido! Lo cobramos a tu tarjeta guardada.";
  const payError = params.pago === "rechazada" ? `No pudimos cobrar a tu tarjeta${params.motivo ? `: ${params.motivo}` : ""}. Prueba con "Pagar con otra tarjeta" o cambia tu tarjeta.` : params.tarjeta === "no-disponible" ? "Los pagos con tarjeta no están disponibles ahora." : null;

  const company = await prisma.company.findUnique({ where: { id: companyId }, include: { invoices: { orderBy: { periodStart: "desc" } } } });
  if (!company) return <LoginForm />;
  const now = new Date();
  const [activeDevices, tiers] = await Promise.all([
    prisma.billedDevice.count({ where: { companyId: company.id, removedAt: null } }),
    prisma.priceTier.findMany({ orderBy: { minDevices: "asc" } }),
  ]);
  const stripeOn = !!process.env.STRIPE_SECRET_KEY;
  const staff = await getStaffId();
  const trialLeft = daysUntil(company.trialEndsAt, now);
  const open = company.invoices.filter((i) => i.status === "OPEN");
  const contact = `escríbenos a ${BRAND.supportEmail}${BRAND.supportWhatsApp ? ` o al WhatsApp +${BRAND.supportWhatsApp}` : ""}`;

  return (
    <>
      <SiteNav />
      <div className="wrap" style={{ maxWidth: 860, paddingBottom: 40 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1 className="page-title">{company.name}</h1>
          <form action={logoutAction}><button className="btn sm s">Salir</button></form>
        </div>
        <CuentaNav active="cuenta" />
        <div style={{ display: "grid", gap: 12, margin: "12px 0" }}>
          {params.bienvenido && <div className="ok">¡Listo! Tu plataforma de rastreo ya está creada. Te enviamos los datos por correo y WhatsApp.</div>}
          {paymentNotice && <div className="ok">{paymentNotice}</div>}
          {params.pago === "cancelado" && <div className="warn">El pago se canceló. Puedes intentarlo de nuevo cuando quieras.</div>}
          {params.pago === "no-disponible" && <div className="warn">El pago en línea no está disponible. Para pagar, {contact}.</div>}
          {company.status === "BLOCKED" && <div className="err">Tu plataforma está bloqueada por una factura vencida. Págala y se reactiva al momento.</div>}
          {open.length > 0 && company.status !== "BLOCKED" && <div className="warn">Tienes {open.length === 1 ? "una factura pendiente" : `${open.length} facturas pendientes`}. Paga antes del día 16 para que no se bloquee tu plataforma.</div>}
        </div>

        <div className="panel">
          <dl className="kv">
            <dt>Estado</dt><dd><span className={`tag ${company.status}`}>{STATUS_LABELS[company.status]}</span></dd>
            {company.billingEnabled ? (
              <>
                <dt>Prueba gratis</dt><dd>{company.status === "TRIAL" ? `Hasta el ${formatDate(company.trialEndsAt)} (${trialLeft} días)` : `Terminó el ${formatDate(company.trialEndsAt)}`}</dd>
                <dt>Equipos</dt><dd>{activeDevices} de {company.deviceLimit} disponibles<div className="hint">Para subir más, pídenos aumentar tu límite.</div></dd>
                <dt>Cómo se cobra</dt><dd>A fin de cada mes te llega la factura de los equipos que subiste y de los que cumplen su año. Pagas del 1 al 15.</dd>
                <dt>Precio por equipo al año</dt><dd>{tiers.filter((t) => t.priceCents > 0).map((t, i, arr) => <div key={t.id}>{formatMoney(t.priceCents, t.currency)} ({t.minDevices}{arr[i + 1] ? ` a ${arr[i + 1].minDevices - 1}` : " o más"} equipos)</div>)}{!tiers.some((t) => t.priceCents > 0) && "Por definir"}</dd>
              </>
            ) : (
              <>
                <dt>Equipos</dt><dd>{activeDevices}</dd>
                <dt>Cobro</dt><dd>Tu cuenta sigue con las mismas condiciones que tenías con GPS Link.</dd>
              </>
            )}
            <dt>Código de empresa</dt><dd><b>{company.slug}</b></dd>
            <dt>Link para entrar a tu cuenta</dt><dd><a href={accountLoginUrl(company)} target="_blank" rel="noreferrer" style={{ color: "var(--p)", fontWeight: 700 }}>{accountLoginUrl(company)}</a><div className="hint">Tú y tus administradores entran aquí.</div></dd>
            <dt>Tu plataforma</dt><dd><a href={`${companyPlatformOrigin(company)}/login`} target="_blank" rel="noreferrer" style={{ color: "var(--p)", fontWeight: 700 }}>{companyPlatformOrigin(company)}</a><div className="hint">Entra con tu correo ({company.email}) y tu contraseña{company.billingEnabled ? "" : " de la plataforma"}. Ahí pones tu logo y colores, y creas tus clientes.</div></dd>
          </dl>
        </div>

        {stripeOn && (
          <div className="panel" style={{ marginTop: 18 }}>
            <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 10 }}>Método de pago</h2>
            {payError && <div className="err" role="alert">{payError}</div>}
            {company.cardPaymentMethodId ? (
              <>
                <p style={{ margin: "0 0 10px" }}>Tarjeta guardada: <b>{cardLabel(company)}</b>. Cada factura se cobra sola a esta tarjeta el día que sale, y te avisamos.</p>
                {!staff && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <form action={saveCardAction}><button className="btn sm">Cambiar tarjeta</button></form>
                    <form action={removeCardAction}><button className="btn sm s">Quitar tarjeta</button></form>
                  </div>
                )}
              </>
            ) : (
              <>
                <p style={{ margin: "0 0 10px" }}>Guarda tu tarjeta y tus facturas se cobran solas cada mes, sin que tengas que entrar a pagar. La tarjeta la guarda Stripe de forma segura; nosotros no vemos el número.</p>
                {staff ? <p className="hint">Solo el dueño de la cuenta puede guardar la tarjeta.</p> : <form action={saveCardAction}><button className="btn sm">Guardar tarjeta</button></form>}
              </>
            )}
          </div>
        )}

        <div className="panel" style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 10 }}>Facturas</h2>
          {company.invoices.length === 0 ? (
            <p className="hint">Todavía no tienes facturas.</p>
          ) : (
            <table className="t">
              <thead><tr><th>Mes</th><th>Equipos</th><th>Total</th><th>Vence</th><th>Estado</th></tr></thead>
              <tbody>
                {company.invoices.map((i) => (
                  <tr key={i.id}>
                    <td>{formatDate(i.periodStart)}</td>
                    <td>{i.devices} ({i.newDevices} nuevos · {i.renewals} renovaciones)</td>
                    <td>{formatMoney(i.amountCents, i.currency)}</td>
                    <td>{formatDate(new Date(i.dueAt.getTime() - 86_400_000))}</td>
                    <td>
                      {i.status === "PAID" ? `Pagada (${METHOD_LABELS[i.method ?? ""] ?? i.method})` : stripeOn ? (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {company.cardPaymentMethodId && <form action={payAction}><input type="hidden" name="invoiceId" value={i.id} /><input type="hidden" name="useCard" value="1" /><button className="btn sm">Pagar con {cardLabel(company)}</button></form>}
                          <form action={payAction}><input type="hidden" name="invoiceId" value={i.id} /><button className={company.cardPaymentMethodId ? "btn sm s" : "btn sm"}>{company.cardPaymentMethodId ? "Pagar con otra tarjeta" : "Pagar"}</button></form>
                        </div>
                      ) : "Pendiente"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!stripeOn && open.length > 0 && <p className="hint" style={{ marginTop: 10 }}>Para pagar, {contact}.</p>}
        </div>
      </div>
    </>
  );
}
