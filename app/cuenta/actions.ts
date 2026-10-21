"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/config";
import { verifyCompanyLogin } from "@/lib/companies";
import { clearSession, getSession, setSession } from "@/lib/session";
import { getStripe } from "@/lib/stripe";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const company = await verifyCompanyLogin(email, password);
  if (!company) return { error: "Correo o contraseña incorrectos." };
  await setSession("company", company.id);
  redirect("/cuenta");
}

export async function logoutAction() {
  await clearSession("company");
  redirect("/cuenta");
}

export async function payAction() {
  const companyId = await getSession("company");
  if (!companyId) redirect("/cuenta");
  const company = await prisma.company.findUnique({ where: { id: companyId }, include: { plan: true } });
  if (!company) redirect("/cuenta");
  const stripe = getStripe();
  if (!stripe || company.plan.priceCents <= 0) redirect("/cuenta?pago=no-disponible");

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: company.email,
    client_reference_id: company.id,
    metadata: { companyId: company.id, planId: company.planId },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: company.plan.currency,
          unit_amount: company.plan.priceCents,
          product_data: { name: `GPS Link · ${company.plan.name} (${company.plan.devices} equipos) · 1 año` },
        },
      },
    ],
    success_url: `${appUrl()}/cuenta?pago=ok&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/cuenta?pago=cancelado`,
  });
  redirect(session.url!);
}
