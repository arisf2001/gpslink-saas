import Stripe from "stripe";
import { prisma } from "@/lib/db";
import { applyActivationInvoice } from "@/lib/activation";
import { applyCheckoutSession } from "@/lib/checkout";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("webhook not configured", { status: 503 });
  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }
  if (await prisma.processedEvent.findUnique({ where: { id: event.id } })) return Response.json({ received: true, duplicate: true });

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    await applyCheckoutSession(event.data.object);
  }
  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    await applyActivationInvoice(event.data.object, event.type === "invoice.paid");
  }
  await prisma.processedEvent.create({ data: { id: event.id } });
  return Response.json({ received: true });
}
