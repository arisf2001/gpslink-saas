import type Stripe from "stripe";
import { prisma } from "./db";
import { recordPayment } from "./companies";

// Shared by the webhook and the success redirect; recordPayment is idempotent on the session id.
export async function applyCheckoutSession(session: Stripe.Checkout.Session) {
  const companyId = session.metadata?.companyId;
  if (!companyId || session.payment_status !== "paid" || session.mode !== "payment") return null;
  if (!(await prisma.company.findUnique({ where: { id: companyId } }))) return null;
  return recordPayment(companyId, {
    amountCents: session.amount_total ?? 0,
    currency: session.currency ?? "usd",
    method: "stripe",
    reference: session.id,
  });
}
