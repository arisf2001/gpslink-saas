import type Stripe from "stripe";
import type { Company } from "@prisma/client";
import { prisma } from "./db";
import { appUrl } from "./config";
import { getStripe } from "./stripe";

async function customerFor(stripe: Stripe, company: Company): Promise<string> {
  if (company.stripeCustomerId) return company.stripeCustomerId;
  const id = (await stripe.customers.create({ email: company.email, name: company.name, metadata: { companyId: company.id } })).id;
  await prisma.company.update({ where: { id: company.id }, data: { stripeCustomerId: id } });
  return id;
}

export async function startCardSetup(company: Company): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    customer: await customerFor(stripe, company),
    currency: "usd",
    allowed_payment_method_types: ["card"],
    locale: "es",
    metadata: { kind: "company_card", companyId: company.id },
    success_url: `${appUrl()}/cuenta?tarjeta=ok&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/cuenta?tarjeta=cancelada`,
  });
  return session.url;
}

export async function applyCompanyCardCheckout(session: Stripe.Checkout.Session): Promise<Company | null> {
  const companyId = session.metadata?.companyId;
  const stripe = getStripe();
  if (!stripe || !companyId || session.mode !== "setup" || session.status !== "complete") return null;
  const intentId = typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent?.id;
  const intent = intentId ? await stripe.setupIntents.retrieve(intentId, { expand: ["payment_method"] }) : null;
  const pm = intent?.payment_method && typeof intent.payment_method !== "string" ? intent.payment_method : null;
  if (!pm) return null;
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return null;
  if (company.cardPaymentMethodId === pm.id) return company;
  if (company.cardPaymentMethodId) await stripe.paymentMethods.detach(company.cardPaymentMethodId).catch(() => null);
  const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
  return prisma.company.update({
    where: { id: companyId },
    data: { cardPaymentMethodId: pm.id, cardBrand: pm.card?.brand ?? null, cardLast4: pm.card?.last4 ?? null, ...(customer ? { stripeCustomerId: customer } : {}) },
  });
}

export async function removeCard(company: Company): Promise<void> {
  if (company.cardPaymentMethodId) await getStripe()?.paymentMethods.detach(company.cardPaymentMethodId).catch(() => null);
  await prisma.company.update({ where: { id: company.id }, data: { cardPaymentMethodId: null, cardBrand: null, cardLast4: null } });
}

export function cardLabel(company: Pick<Company, "cardBrand" | "cardLast4">): string {
  const brand = (company.cardBrand ?? "tarjeta").replace(/^./, (c) => c.toUpperCase());
  return `${brand} •••• ${company.cardLast4 ?? "----"}`;
}
