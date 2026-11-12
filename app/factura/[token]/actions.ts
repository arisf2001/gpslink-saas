"use server";

import { redirect } from "next/navigation";
import { appUrl } from "@/lib/config";
import { prisma } from "@/lib/db";
import { invoiceLabel } from "@/lib/manual-invoices";
import { getStripe } from "@/lib/stripe";

export async function payInvoiceAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const inv = await prisma.manualInvoice.findUnique({ where: { token } });
  if (!inv || inv.status !== "OPEN") redirect(`/factura/${encodeURIComponent(token)}`);
  const stripe = getStripe();
  if (!stripe) redirect(`/factura/${token}?pago=no-disponible`);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: inv.email,
    metadata: { kind: "manual_invoice", invoiceId: inv.id },
    line_items: [{ quantity: 1, price_data: { currency: inv.currency, unit_amount: inv.totalCents, product_data: { name: `${invoiceLabel(inv.number)} · ${inv.name}` } } }],
    success_url: `${appUrl()}/factura/${token}?pago=ok&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/factura/${token}?pago=cancelado`,
  });
  redirect(session.url!);
}
