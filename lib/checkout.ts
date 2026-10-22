import type Stripe from "stripe";
import { prisma } from "./db";
import { markInvoicePaid } from "./companies";
import { applySimCheckout } from "./sim/notify";
import { applyActivationCheckout } from "./activation";
import { applyCompanyCardCheckout } from "./company-card";

// Shared by the webhook and the success redirect; markInvoicePaid is idempotent on the session id.
export async function applyCheckoutSession(session: Stripe.Checkout.Session) {
  if (session.metadata?.kind === "sim") return applySimCheckout(session);
  if (session.metadata?.kind === "activation") return applyActivationCheckout(session);
  if (session.metadata?.kind === "company_card") return applyCompanyCardCheckout(session);
  const { companyId, invoiceId } = session.metadata ?? {};
  if (!companyId || !invoiceId || session.payment_status !== "paid" || session.mode !== "payment") return null;
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId } });
  if (!invoice || (session.amount_total ?? 0) < invoice.amountCents) return null;
  return markInvoicePaid(invoice.id, { method: "stripe", reference: session.id });
}
