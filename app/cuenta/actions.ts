"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ADDON_DEVICES, appUrl } from "@/lib/config";
import { dueSlots, verifyCompanyLogin } from "@/lib/companies";
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
  const company = await prisma.company.findUnique({ where: { id: companyId }, include: { plan: true, slots: true } });
  if (!company) redirect("/cuenta");
  const stripe = getStripe();
  if (!stripe) redirect("/cuenta?pago=no-disponible");
  const prices = await prisma.categoryPrice.findUnique({ where: { category: company.plan.category } });
  const kind = String(formData.get("kind") ?? "");
  const metadata: Record<string, string> = { companyId: company.id, kind };
  let name = "";
  let unit = 0;
  let quantity = 1;
  let currency = prices?.currency ?? "usd";

  if (kind === "plan") {
    const plan = await prisma.plan.findFirst({ where: { id: String(formData.get("planId") ?? ""), active: true } });
    if (!plan || plan.priceCents <= 0) redirect("/cuenta?pago=no-disponible");
    name = `GPS Link · Paquete de ${plan.devices} equipos · 1 año por equipo`;
    unit = plan.priceCents;
    currency = plan.currency;
    metadata.planId = plan.id;
  } else if (kind === "block") {
    const blocks = Number(formData.get("blocks"));
    if (!company.slots.length || company.status === "BLOCKED" || !Number.isInteger(blocks) || blocks < 1 || blocks > 20 || !prices?.blockPriceCents) redirect("/cuenta?pago=no-disponible");
    name = `GPS Link · ${ADDON_DEVICES} equipos extra · 1 año por equipo`;
    unit = prices.blockPriceCents;
    quantity = blocks;
    metadata.blocks = String(blocks);
  } else if (kind === "renewal") {
    const due = dueSlots(company.slots, new Date());
    if (!due.length || !prices?.renewalPriceCents) redirect("/cuenta?pago=no-disponible");
    name = "GPS Link · Renovación de equipo · 1 año";
    unit = prices.renewalPriceCents;
    quantity = due.length;
    metadata.renewCount = String(due.length);
  } else {
    redirect("/cuenta");
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: company.email,
    client_reference_id: company.id,
    metadata,
    line_items: [{ quantity, price_data: { currency, unit_amount: unit, product_data: { name } } }],
    success_url: `${appUrl()}/cuenta?pago=ok&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/cuenta?pago=cancelado`,
  });
  redirect(session.url!);
}
