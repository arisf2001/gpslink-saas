"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { rateLimit } from "@/lib/ai/assistant";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/config";
import { chargeSavedCard, verifyCompanyLogin, verifyResellerLogin } from "@/lib/companies";
import { removeCard, startCardSetup } from "@/lib/company-card";
import { adminCredentialsMatch, clearSession, getSession, setSession } from "@/lib/session";
import { getStripe } from "@/lib/stripe";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Escribe tu correo y tu contraseña." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimit(`cuenta-login:${ip}`, 10) > 0 || rateLimit(`cuenta-login:${email}`, 5) > 0) return { error: "Demasiados intentos. Espera un minuto." };
  if (adminCredentialsMatch(email, password)) {
    await setSession("admin", "owner");
    redirect("/admin");
  }
  const company = (await verifyCompanyLogin(email, password)) ?? (await verifyResellerLogin(email, password).catch((error) => {
    console.error("[cuenta] login GPS Link:", (error as Error).message);
    return null;
  }));
  if (company === "not_reseller") return { error: "Esta entrada es para marcas blancas. Para tu plataforma de rastreo usa \"Entrar a la plataforma\", arriba." };
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
  if (invoice.company.cardPaymentMethodId && formData.get("useCard") === "1") {
    const r = await chargeSavedCard(invoice.id);
    redirect(r?.ok ? "/cuenta?pago=tarjeta" : `/cuenta?pago=rechazada&motivo=${encodeURIComponent(r && !r.ok ? r.error : "")}`);
  }
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

export async function saveCardAction() {
  const companyId = await getSession("company");
  const company = companyId ? await prisma.company.findUnique({ where: { id: companyId } }) : null;
  if (!company) redirect("/cuenta");
  const url = await startCardSetup(company);
  redirect(url ?? "/cuenta?tarjeta=no-disponible");
}

export async function removeCardAction() {
  const companyId = await getSession("company");
  const company = companyId ? await prisma.company.findUnique({ where: { id: companyId } }) : null;
  if (!company) redirect("/cuenta");
  await removeCard(company);
  redirect("/cuenta?tarjeta=quitada");
}
