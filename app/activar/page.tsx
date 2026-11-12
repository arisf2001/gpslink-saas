import type { Metadata } from "next";
import { activationAvailable, activationSetting, applyActivationCheckout, MODELS, offerItems, offerTotal, STABLE_HOURS, STATUS_LABEL, type ModelKey } from "@/lib/activation";
import { userInfo } from "@/lib/ai/gps";
import { prisma } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { userIdByEmail } from "@/lib/gpswox";
import { getSession } from "@/lib/session";
import { getStripe } from "@/lib/stripe";
import { SiteNav } from "../site-nav";
import { activarLogoutAction } from "./actions";
import { ActivarForm, ActivarLogin } from "./forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Activa tu dispositivo | GPS Link", robots: { index: false } };

export default async function ActivarPage({ searchParams }: { searchParams: Promise<{ ok?: string; session_id?: string; cancelado?: string }> }) {
  const sp = await searchParams;
  const hash = await getSession("ia");
  const email = hash ? (await userInfo(hash).catch(() => null))?.email ?? null : null;
  const userId = email ? await userIdByEmail(email).catch(() => null) : null;

  if (sp.ok && sp.session_id) {
    const session = await getStripe()?.checkout.sessions.retrieve(sp.session_id).catch(() => null);
    if (session?.metadata?.activationId === sp.ok) await applyActivationCheckout(session).catch((e) => console.error("[activacion] checkout:", e));
  }
  const s = await activationSetting();
  const avail = userId ? await activationAvailable(userId) : null;
  const acts = userId ? await prisma.deviceActivation.findMany({ where: { gpswoxUserId: userId, status: { not: "CARD" } }, orderBy: { createdAt: "desc" } }) : [];
  const total = offerTotal(s);
  const done = sp.ok ? acts.find((a) => a.id === sp.ok) : null;

  return (
    <>
      <SiteNav />
      <main className="wrap" style={{ maxWidth: 560, margin: "30px auto", padding: "0 16px" }}>
        <div className="panel" style={{ padding: 24 }}>
          <h1 style={{ fontSize: 24, marginBottom: 10 }}>Activa tu dispositivo ahora</h1>
          {!email || !userId ? (
            <>
              {email && !userId && <div className="err" style={{ marginBottom: 10 }}>No encontramos tu cuenta. Escríbenos.</div>}
              <p>Entra con tu cuenta de rastreo para activar un equipo GPS.</p>
              <ActivarLogin />
            </>
          ) : (
            <>
              <p className="hint">Cuenta: {email}</p>
              {done && <div className="ok" style={{ margin: "10px 0" }}>¡Listo! Te enviamos por correo las instrucciones para conectar {done.name}. Cuando lleve {STABLE_HOURS} horas conectado se cobra y te aparece en tu cuenta.</div>}
              {sp.cancelado && <div className="err" style={{ margin: "10px 0" }}>No se guardó la tarjeta. Puedes intentarlo otra vez.</div>}
              {!avail?.ok ? (
                <p>La activación en línea no está disponible para tu cuenta. Escríbenos para activar tu equipo.</p>
              ) : (
                <>
                  <ol style={{ paddingLeft: 18, margin: "10px 0", lineHeight: 1.6 }}>
                    <li>Escoge tu equipo, pon el IMEI y tu tarjeta.</li>
                    <li>Te llegan por correo las instrucciones para conectarlo.</li>
                    <li><b>No se cobra nada ahora.</b> Se cobra cuando el equipo lleve {STABLE_HOURS} horas conectado. Si nunca se conecta, no se cobra.</li>
                  </ol>
                  <p style={{ fontSize: 18, margin: "10px 0" }}>
                    {total > 0 ? <>Precio por equipo: <b>{formatMoney(total, s.currency)}</b> por 12 meses</> : <b>Activación sin costo</b>}
                    {offerItems(s).length > 0 && total > 0 && <span className="hint"> ({offerItems(s).map((i) => (i.cents ? `${i.label} ${formatMoney(i.cents, s.currency)}` : `${i.label} gratis`)).join(" + ")})</span>}
                  </p>
                  <p className="hint">Para cada equipo adicional se repite este paso.</p>
                  <ActivarForm models={(Object.keys(MODELS) as ModelKey[]).map((k) => ({ key: k, label: MODELS[k].label }))} />
                </>
              )}
              {acts.length > 0 && (
                <>
                  <h2 style={{ fontSize: 18, margin: "18px 0 6px" }}>Mis activaciones</h2>
                  {acts.map((a) => (
                    <p key={a.id} style={{ fontSize: 14, margin: "4px 0" }}>
                      <b>{a.name}</b> · {MODELS[a.model as ModelKey]?.label} · {STATUS_LABEL[a.status] ?? a.status}{a.expiresAt ? ` · vence ${formatDate(a.expiresAt)}` : ""}
                    </p>
                  ))}
                </>
              )}
              <form action={activarLogoutAction} style={{ marginTop: 14 }}><button className="linkbtn">Salir</button></form>
            </>
          )}
        </div>
      </main>
    </>
  );
}
