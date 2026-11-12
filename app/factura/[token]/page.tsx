import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { formatDate, formatMoney, METHOD_LABELS } from "@/lib/format";
import { applyManualInvoiceCheckout, checkGhlInvoice, invoiceItems, invoiceLabel } from "@/lib/manual-invoices";
import { getStripe } from "@/lib/stripe";
import { payInvoiceAction } from "./actions";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Factura · GPS Link", robots: { index: false } };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ pago?: string; session_id?: string }> }) {
  const { token } = await params;
  const { pago, session_id } = await searchParams;
  let inv = await prisma.manualInvoice.findUnique({ where: { token } });
  const stripe = getStripe();
  if (inv && inv.status === "OPEN" && pago === "ok" && session_id && stripe) {
    const session = await stripe.checkout.sessions.retrieve(session_id).catch(() => null);
    if (session?.metadata?.invoiceId === inv.id) inv = (await applyManualInvoiceCheckout(session)) ?? inv;
  }
  if (inv?.provider === "ghl" && inv.status === "OPEN") inv = (await checkGhlInvoice(inv).catch(() => null)) ?? inv;
  if (!inv || inv.status === "VOID") {
    return <main className="wrap" style={{ maxWidth: 640, margin: "40px auto", padding: "0 16px" }}><div className="panel" style={{ padding: 24 }}><p>Esta factura no existe o fue anulada. Escríbenos si tienes dudas.</p></div></main>;
  }
  const items = invoiceItems(inv.items);
  return (
    <main className="wrap factura" style={{ maxWidth: 680, margin: "40px auto", padding: "0 16px" }}>
      <div className="panel" style={{ padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-gpslink.png" alt="GPS Link" style={{ height: 64 }} />
          <div style={{ textAlign: "right" }}>
            <h1 style={{ fontSize: 22, margin: 0 }}>{invoiceLabel(inv.number)}</h1>
            <div className="hint">Fecha: {formatDate(inv.createdAt)}<br />Vence: {formatDate(inv.dueAt)}</div>
          </div>
        </div>
        <p><b>Para:</b> {inv.name}<br />{inv.email}{inv.phone ? <><br />{inv.phone}</> : null}</p>
        <table className="table" style={{ width: "100%", margin: "16px 0" }}>
          <thead><tr><th style={{ textAlign: "left" }}>Descripción</th><th>Cant.</th><th style={{ textAlign: "right" }}>Precio</th><th style={{ textAlign: "right" }}>Importe</th></tr></thead>
          <tbody>
            {items.map((i, n) => (
              <tr key={n}><td>{i.desc}</td><td style={{ textAlign: "center" }}>{i.qty}</td><td style={{ textAlign: "right" }}>{formatMoney(i.unitCents, inv.currency)}</td><td style={{ textAlign: "right" }}>{formatMoney(Math.round(i.qty * i.unitCents), inv.currency)}</td></tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={3} style={{ textAlign: "right" }}><b>Total</b></td><td style={{ textAlign: "right", fontSize: 18 }}><b>{formatMoney(inv.totalCents, inv.currency)}</b></td></tr></tfoot>
        </table>
        {inv.note && <p className="hint" style={{ whiteSpace: "pre-wrap" }}>{inv.note}</p>}
        {inv.status === "PAID" ? (
          <div className="ok" style={{ marginTop: 14 }}>Pagada el {formatDate(inv.paidAt)}{inv.method ? ` · ${METHOD_LABELS[inv.method] ?? inv.method}` : ""}. ¡Gracias!</div>
        ) : (
          <>
            {pago === "cancelado" && <div className="err" style={{ margin: "10px 0" }}>El pago no se completó. Puedes intentarlo otra vez.</div>}
            {pago === "no-disponible" && <div className="err" style={{ margin: "10px 0" }}>El pago en línea no está disponible ahora. Escríbenos.</div>}
            <form action={payInvoiceAction} className="no-print" style={{ marginTop: 14 }}><input type="hidden" name="token" value={token} /><button className="btn">Pagar {formatMoney(inv.totalCents, inv.currency)} con tarjeta</button></form>
          </>
        )}
        <div className="no-print" style={{ marginTop: 12 }}><PrintButton /></div>
      </div>
    </main>
  );
}
