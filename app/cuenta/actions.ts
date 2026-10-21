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

export async function payAction(formData: FormData) {
  const companyId = await getSession("company");
  if (!companyId) redirect("/cuenta");
  const invoice = await prisma.invoice.findFirst({ where: { id: String(formData.get("invoiceId") ?? ""), companyId, status: "OPEN" }, include: { company: true } });
  const stripe = getStripe();
  if (!invoice || !stripe || invoice.amountCents <= 0) redirect("/cuenta?pago=no-disponible");
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: invoice.company.email,
    client_reference_id: companyId,
    metadata: { companyId, invoiceId: invoice.id },
    line_items: [{ quantity: 1, price_data: { currency: invoice.currency, unit_amount: invoice.amountCents, product_data: { name: `GPS Link · Factura de ${invoice.devices} equipos` } } }],
    success_url: `${appUrl()}/cuenta?pago=ok&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/cuenta?pago=cancelado`,
  });
  redirect(session.url!);
}
