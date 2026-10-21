import type Stripe from "stripe";
import { prisma } from "./db";
import { recordPurchase, type Purchase } from "./companies";

// Shared by the webhook and the success redirect; recordPurchase is idempotent on the session id.
export async function applyCheckoutSession(session: Stripe.Checkout.Session) {
  const meta = session.metadata ?? {};
  const companyId = meta.companyId;
  const kind = meta.kind as Purchase["kind"] | undefined;
  if (!companyId || session.payment_status !== "paid" || session.mode !== "payment") return null;
  if (kind !== "plan" && kind !== "block" && kind !== "renewal") return null;
  if (!(await prisma.company.findUnique({ where: { id: companyId } }))) return null;
  return recordPurchase(companyId, {
    kind,
    planId: meta.planId || undefined,
    blocks: Number(meta.blocks || 0),
    renewCount: Number(meta.renewCount || 0) || undefined,
    amountCents: session.amount_total ?? 0,
    currency: session.currency ?? "usd",
    method: "stripe",
    reference: session.id,
  });
}
