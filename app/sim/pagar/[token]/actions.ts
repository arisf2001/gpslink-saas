"use server";

import { redirect } from "next/navigation";
import { appUrl } from "@/lib/config";
import { prisma } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

export async function paySimAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const renewal = await prisma.simRenewal.findUnique({ where: { token } });
  if (!renewal || renewal.status !== "PENDING") redirect(`/sim/pagar/${encodeURIComponent(token)}`);
  const stripe = getStripe();
  if (!stripe) redirect(`/sim/pagar/${token}?pago=no-disponible`);
  const card = await prisma.simCard.findUnique({ where: { iccid: renewal.iccid } });
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ...(card?.ownerEmail ? { customer_email: card.ownerEmail } : {}),
    metadata: { kind: "sim", renewalId: renewal.id, iccid: renewal.iccid },
    line_items: [{ quantity: 1, price_data: { currency: renewal.currency, unit_amount: renewal.amountCents, product_data: { name: `Plan de datos SIM 1 año${renewal.reactivation ? " + reactivación" : ""}${card?.deviceName ? ` · ${card.deviceName}` : ""}` } } }],
    success_url: `${appUrl()}/sim/pagar/${token}?pago=ok&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/sim/pagar/${token}?pago=cancelado`,
  });
  redirect(session.url!);
}
