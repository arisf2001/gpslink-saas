import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { daysLeft } from "@/lib/sim/carriers";
import { applySimCheckout, REACTIVATION_NOTE } from "@/lib/sim/notify";
import { getStripe } from "@/lib/stripe";
import { paySimAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pagar SIM · GPS Link", robots: { index: false } };

export default async function PaySimPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ pago?: string; session_id?: string }> }) {
  const { token } = await params;
  const { pago, session_id } = await searchParams;
  let renewal = await prisma.simRenewal.findUnique({ where: { token } });
  const stripe = getStripe();
  if (renewal && renewal.status === "PENDING" && pago === "ok" && session_id && stripe) {
    const session = await stripe.checkout.sessions.retrieve(session_id).catch(() => null);
    if (session?.metadata?.renewalId === renewal.id) renewal = (await applySimCheckout(session)) ?? renewal;
  }
  const card = renewal ? await prisma.simCard.findUnique({ where: { iccid: renewal.iccid } }) : null;
  const left = daysLeft(card?.expiresAt ?? null);

  return (
    <main className="wrap" style={{ maxWidth: 520, margin: "40px auto", padding: "0 16px" }}>
      <div className="panel" style={{ padding: 24 }}>
        <h1 style={{ fontSize: 22, marginBottom: 10 }}>Renovar SIM del GPS</h1>
        {!renewal || renewal.status === "CANCELED" ? (
          <p>Este enlace ya no es válido. Escríbenos para enviarte uno nuevo.</p>
        ) : renewal.status !== "PENDING" ? (
          <>
            <div className="ok" style={{ marginBottom: 10 }}>{renewal.status === "DONE" ? "Tu SIM ya está activa. ¡Gracias!" : "¡Gracias! Recibimos tu pago."}</div>
            {renewal.status === "PAID" && <p>La reactivación puede tardar hasta 5 días laborables. Te avisamos cuando esté lista.</p>}
          </>
        ) : (
          <>
            {pago === "cancelado" && <div className="err" style={{ marginBottom: 10 }}>El pago no se completó. Puedes intentarlo otra vez.</div>}
            {pago === "no-disponible" && <div className="err" style={{ marginBottom: 10 }}>El pago en línea no está disponible ahora. Escríbenos.</div>}
            <p><b>Vehículo:</b> {card?.deviceName ?? "—"}</p>
            <p><b>SIM:</b> terminada en {renewal.iccid.slice(-6)}</p>
            <p><b>Vence:</b> {card?.expiresAt ? formatDate(card.expiresAt) : "—"}{left !== null && (left > 0 ? ` (le quedan ${left} ${left === 1 ? "día" : "días"})` : " (vencida)")}</p>
            <p><b>Renovación:</b> 1 año{renewal.reactivation ? " + reactivación" : ""}. Los días que le quedan no se pierden.</p>
            <p style={{ fontSize: 22, margin: "12px 0" }}><b>{formatMoney(renewal.amountCents, renewal.currency)}</b></p>
            <p className="hint" style={{ marginBottom: 14 }}>{REACTIVATION_NOTE}</p>
            <form action={paySimAction}><input type="hidden" name="token" value={token} /><button className="btn">Pagar en línea</button></form>
          </>
        )}
      </div>
    </main>
  );
}
