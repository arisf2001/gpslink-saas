"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { CURRENCIES, PERIOD_LABELS, SubDistributorError, blockClient, createSubDistributor, endOfDayDR, registerClientPayment, setClientPlan, syncClients, unblockClient } from "@/lib/clients";
import { parseMoneyToCents } from "@/lib/format";
import { getSession } from "@/lib/session";
import { platformOriginFor } from "@/lib/brand-web";
import { trackSsoToken } from "@/lib/track-sso";

async function requireCompany() {
  const id = await getSession("company");
  const company = id ? await prisma.company.findUnique({ where: { id } }) : null;
  if (!company) redirect("/cuenta");
  return company;
}

async function ownClient(companyId: string, formData: FormData) {
  const client = await prisma.endClient.findFirst({ where: { id: String(formData.get("clientId") ?? ""), companyId }, include: { plan: true } });
  if (!client) redirect("/cuenta/clientes");
  return client;
}

const METHODS = ["efectivo", "deposito", "azul", "manual"];

export async function syncClientsAction() {
  const company = await requireCompany();
  let failed = false;
  try {
    await syncClients(company);
  } catch (error) {
    console.error("[clientes] sync:", (error as Error).message);
    failed = true;
  }
  redirect(failed ? "/cuenta/clientes?error=sync" : "/cuenta/clientes?ok=sync");
}

export async function savePlanAction(formData: FormData) {
  const company = await requireCompany();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const priceCents = parseMoneyToCents(String(formData.get("price") ?? ""));
  const currency = String(formData.get("currency") ?? "usd");
  const months = Number(formData.get("months"));
  if (!name || priceCents === null || priceCents <= 0 || !(CURRENCIES as readonly string[]).includes(currency) || !PERIOD_LABELS[months]) redirect("/cuenta/planes?error=datos");
  const data = { name, priceCents, currency, months, active: id ? formData.get("active") === "on" : true };
  if (id) {
    const { count } = await prisma.clientPlan.updateMany({ where: { id, companyId: company.id }, data });
    if (!count) redirect("/cuenta/planes");
  } else {
    await prisma.clientPlan.create({ data: { ...data, companyId: company.id } });
  }
  redirect("/cuenta/planes?ok=1");
}

export async function setClientPlanAction(formData: FormData) {
  const company = await requireCompany();
  const client = await ownClient(company.id, formData);
  const back = `/cuenta/clientes/${client.id}`;
  const planId = String(formData.get("planId") ?? "");
  if (!planId) {
    await setClientPlan(client, null, null);
    redirect(`${back}?ok=plan`);
  }
  const plan = await prisma.clientPlan.findFirst({ where: { id: planId, companyId: company.id } });
  const paidUntil = endOfDayDR(String(formData.get("paidUntil") ?? ""));
  if (!plan || !paidUntil) redirect(`${back}?error=plan`);
  await setClientPlan(client, plan.id, paidUntil);
  redirect(`${back}?ok=plan`);
}

export async function clientPaymentAction(formData: FormData) {
  const company = await requireCompany();
  const client = await ownClient(company.id, formData);
  const back = `/cuenta/clientes/${client.id}`;
  const periods = Number(formData.get("periods"));
  const amountCents = parseMoneyToCents(String(formData.get("amount") ?? ""));
  const method = String(formData.get("method") ?? "");
  if (!client.plan || !Number.isInteger(periods) || periods < 1 || periods > 24 || amountCents === null || !METHODS.includes(method)) redirect(`${back}?error=pago`);
  await registerClientPayment(company, client, { periods, amountCents, method, note: String(formData.get("note") ?? "").trim().slice(0, 200) || undefined });
  redirect(`${back}?ok=pago`);
}

export async function blockClientAction(formData: FormData) {
  const company = await requireCompany();
  const client = await ownClient(company.id, formData);
  await blockClient(company, client, "manual");
  redirect(`/cuenta/clientes/${client.id}?ok=bloqueado`);
}

export async function unblockClientAction(formData: FormData) {
  const company = await requireCompany();
  const client = await ownClient(company.id, formData);
  if (!(await unblockClient(client))) redirect(`/cuenta/clientes/${client.id}?error=vencido`);
  redirect(`/cuenta/clientes/${client.id}?ok=desbloqueado`);
}

export async function createSubDistributorAction(formData: FormData) {
  const company = await requireCompany();
  let id: string;
  try {
    id = (await createSubDistributor(company, {
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      devicesLimit: Number(formData.get("devicesLimit")),
    })).id;
  } catch (e) {
    if (e instanceof SubDistributorError) redirect(`/cuenta/clientes?error=sub-${e.message}`);
    throw e;
  }
  redirect(`/cuenta/clientes/${id}?ok=sub`);
}

// Support: the white label opens the tracking platform as any client or sub-distributor below it.
export async function enterClientPlatformAction(formData: FormData) {
  const company = await requireCompany();
  const client = await ownClient(company.id, formData);
  if (client.goneAt) redirect(`/cuenta/clientes/${client.id}`);
  redirect(`${await platformOriginFor(client.gpswoxUserId)}/gpslink-sso?t=${encodeURIComponent(trackSsoToken(client.gpswoxUserId))}`);
}

// Development only (GPSWOX_MODE=mock): fake GPS Link clients to try the panel.
export async function mockClientAction(formData: FormData) {
  const company = await requireCompany();
  if (process.env.GPSWOX_MODE !== "mock" || !company.gpswoxUserId) redirect("/cuenta/clientes");
  const under = Number(formData.get("under")) || company.gpswoxUserId;
  const mock = await prisma.mockClient.create({
    data: { managerId: under, email: String(formData.get("email") ?? "").trim() || `cliente${Date.now()}@example.com`, groupId: formData.get("dealer") === "on" ? 3 : 2 },
  });
  const devices = Math.min(Math.max(Number(formData.get("devices")) || 0, 0), 50);
  if (devices) await prisma.mockDevice.createMany({ data: Array.from({ length: devices }, () => ({ gpswoxUserId: mock.id })) });
  await syncClients(company);
  redirect("/cuenta/clientes?ok=sync");
}
