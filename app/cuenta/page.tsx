import { prisma } from "@/lib/db";
import { applyCheckoutSession } from "@/lib/checkout";
import { BRAND } from "@/lib/config";
import { METHOD_LABELS, STATUS_LABELS, formatDate, formatMoney } from "@/lib/format";
import { resellerLoginUrl } from "@/lib/gpswox";
import { daysUntil } from "@/lib/lifecycle";
import { getSession } from "@/lib/session";
import { getStripe } from "@/lib/stripe";
import { SiteNav } from "../site-nav";
import { logoutAction, payAction } from "./actions";
import { CuentaNav } from "./cuenta-nav";
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

  const company = await prisma.company.findUnique({ where: { id: companyId }, include: { invoices: { orderBy: { periodStart: "desc" } } } });
  if (!company) return <LoginForm />;
  const now = new Date();
  const [activeDevices, tiers] = await Promise.all([
    prisma.billedDevice.count({ where: { companyId: company.id, removedAt: null } }),
    prisma.priceTier.findMany({ orderBy: { minDevices: "asc" } }),
  ]);
  const stripeOn = !!process.env.STRIPE_SECRET_KEY;
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
            <dt>Prueba gratis</dt><dd>{company.status === "TRIAL" ? `Hasta el ${formatDate(company.trialEndsAt)} (${trialLeft} días)` : `Terminó el ${formatDate(company.trialEndsAt)}`}</dd>
            <dt>Equipos</dt><dd>{activeDevices} de {company.deviceLimit} disponibles<div className="hint">Para subir más, pídenos aumentar tu límite.</div></dd>
            <dt>Cómo se cobra</dt><dd>A fin de cada mes te llega la factura de los equipos que subiste y de los que cumplen su año. Pagas del 1 al 15.</dd>
            <dt>Precio por equipo al año</dt><dd>{tiers.filter((t) => t.priceCents > 0).map((t, i, arr) => <div key={t.id}>{formatMoney(t.priceCents, t.currency)} ({t.minDevices}{arr[i + 1] ? ` a ${arr[i + 1].minDevices - 1}` : " o más"} equipos)</div>)}{!tiers.some((t) => t.priceCents > 0) && "Por definir"}</dd>
            <dt>Código de empresa</dt><dd><b>{company.slug}</b></dd>
            <dt>Tu plataforma</dt><dd><a href={resellerLoginUrl()} target="_blank" rel="noreferrer" style={{ color: "var(--p)", fontWeight: 700 }}>{resellerLoginUrl()}</a><div className="hint">Entra con tu correo ({company.email}) y tu contraseña. Ahí pones tu logo y colores, y creas tus clientes.</div></dd>
          </dl>
        </div>

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
                        <form action={payAction}><input type="hidden" name="invoiceId" value={i.id} /><button className="btn sm">Pagar</button></form>
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
