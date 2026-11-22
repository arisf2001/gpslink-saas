import type Stripe from "stripe";
import type { ActivationSetting, DeviceActivation } from "@prisma/client";
import { appUrl, BRAND } from "./config";
import { prisma } from "./db";
import { formatDate, formatMoney } from "./format";
import { addDeviceUser, brandChain, createAdminDevice, deviceIdByImei, lastSignals, setDeviceExpiration } from "./gpswox";
import { emailHtml, sendEmail } from "./notify";
import { notify } from "./notifications";
import { getStripe } from "./stripe";

export const STABLE_HOURS = 5;
const ONLINE_MS = 60 * 60 * 1000;
const trackerIp = () => process.env.TRACKER_IP || "74.208.111.69";

export const MODELS = {
  gt06: { label: "GT06", command: () => `SERVER,0,${trackerIp()},6023,0#` },
  sinotrack: { label: "SinoTrack", command: () => `8040000 ${trackerIp()} 6013` },
} as const;
export type ModelKey = keyof typeof MODELS;
export const isModel = (v: string): v is ModelKey => v in MODELS;

export const STATUS_LABEL: Record<string, string> = {
  CARD: "Falta la tarjeta",
  WAITING_SIGNAL: "Esperando señal del equipo",
  ACTIVE: "Activo",
  PAST_DUE: "Pago pendiente",
  FAILED: "Pago rechazado",
};

export async function activationSetting(): Promise<ActivationSetting> {
  return prisma.activationSetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export function offerItems(s: ActivationSetting): { label: string; cents: number }[] {
  return [
    ...(s.chargePlatform ? [{ label: "Plataforma de rastreo", cents: s.platformCents }] : []),
    ...(s.chargeSim ? [{ label: "SIM de datos", cents: s.simCents }] : []),
  ];
}
export const offerTotal = (s: ActivationSetting) => offerItems(s).reduce((t, i) => t + i.cents, 0);

// Direct track clients follow trackEnabled; clients under a white label only if the owner enabled that brand.
export async function activationAvailable(gpswoxUserId: number): Promise<{ ok: boolean; companyId: string | null }> {
  const s = await activationSetting();
  const resellers = (await brandChain(gpswoxUserId)).filter((c) => c.reseller).map((c) => c.id);
  if (!resellers.length) return { ok: s.trackEnabled, companyId: null };
  const company = await prisma.company.findFirst({ where: { gpswoxUserId: { in: resellers } }, select: { id: true, activationEnabled: true } });
  return company ? { ok: company.activationEnabled, companyId: company.id } : { ok: s.trackEnabled, companyId: null };
}

export function instructionLines(model: ModelKey): string[] {
  const m = MODELS[model];
  return [
    `Instrucciones para tu equipo ${m.label}:`,
    "1. Pon la SIM con datos en el equipo y enciéndelo.",
    `2. Envía este mensaje de texto (SMS) al número de la SIM del equipo: ${m.command()}`,
    "3. Espera la respuesta del equipo y sácalo al aire libre unos minutos para que tome señal GPS.",
    `Cuando el equipo lleve ${STABLE_HOURS} horas conectado, se cobra y te aparece en tu cuenta de rastreo.`,
  ];
}

export async function startActivation(input: { gpswoxUserId: number; email: string; companyId: string | null; model: ModelKey; imei: string; name: string }): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Pagos no disponibles");
  const s = await activationSetting();
  await prisma.deviceActivation.deleteMany({ where: { gpswoxUserId: input.gpswoxUserId, imei: input.imei, status: "CARD" } });
  const act = await prisma.deviceActivation.create({ data: { ...input, amountCents: offerTotal(s), items: offerItems(s).map((i) => i.label).join(" + ") } });
  const prev = await prisma.deviceActivation.findFirst({ where: { gpswoxUserId: input.gpswoxUserId, stripeCustomerId: { not: null } }, select: { stripeCustomerId: true } });
  const customer = prev?.stripeCustomerId ?? (await stripe.customers.create({ email: input.email, metadata: { gpswoxUserId: String(input.gpswoxUserId) } })).id;
  await prisma.deviceActivation.update({ where: { id: act.id }, data: { stripeCustomerId: customer } });
  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    customer,
    currency: s.currency,
    allowed_payment_method_types: ["card"],
    locale: "es",
    metadata: { kind: "activation", activationId: act.id },
    success_url: `${appUrl()}/activar?ok=${act.id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/activar?cancelado=1`,
  });
  return session.url!;
}

// Card saved: create the device hidden under the admin account and email the instructions.
export async function applyActivationCheckout(session: Stripe.Checkout.Session): Promise<DeviceActivation | null> {
  const id = session.metadata?.activationId;
  if (!id || session.mode !== "setup" || session.status !== "complete") return null;
  const claimed = await prisma.deviceActivation.updateMany({ where: { id, status: "CARD" }, data: { status: "WAITING_SIGNAL" } });
  if (!claimed.count) return prisma.deviceActivation.findUnique({ where: { id } });
  const stripe = getStripe()!;
  const intentId = typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent?.id;
  const intent = intentId ? await stripe.setupIntents.retrieve(intentId) : null;
  const paymentMethodId = typeof intent?.payment_method === "string" ? intent.payment_method : (intent?.payment_method?.id ?? null);
  let act = await prisma.deviceActivation.update({ where: { id }, data: { paymentMethodId } });
  try {
    const deviceId = (await deviceIdByImei(act.imei)) ?? (await createAdminDevice(act.imei, act.name));
    act = await prisma.deviceActivation.update({ where: { id }, data: { deviceId, error: null } });
  } catch (e) {
    act = await prisma.deviceActivation.update({ where: { id }, data: { error: String((e as Error).message).slice(0, 2000) } });
    await sendEmail(BRAND.supportEmail, `Activación: no se pudo crear el equipo ${act.imei}`, emailHtml("Revisar activación", [`Cliente ${act.email}, IMEI ${act.imei}.`, act.error ?? ""], { label: "Abrir activaciones", url: `${appUrl()}/admin/activacion` }));
  }
  await notify("activation_instructions", audience(act), { subject: `Cómo conectar tu equipo ${act.name}`, title: `Activa tu ${MODELS[act.model as ModelKey]?.label ?? "equipo"}`, lines: [`Equipo: ${act.name} · IMEI ${act.imei}.`, ...instructionLines(act.model as ModelKey)] });
  return act;
}

const audience = (act: DeviceActivation) => ({ gpswoxUserId: act.gpswoxUserId, email: act.email, companyId: act.companyId });

const addYear = (d: Date) => { const x = new Date(d); x.setFullYear(x.getFullYear() + 1); return x; };

async function charge(act: DeviceActivation): Promise<string | null> {
  if (act.amountCents <= 0) return null;
  const stripe = getStripe();
  if (!stripe || !act.stripeCustomerId || !act.paymentMethodId) throw new Error("Falta la tarjeta del cliente");
  const s = await activationSetting();
  const price = await stripe.prices.create({ currency: s.currency, unit_amount: act.amountCents, recurring: { interval: "year" }, product_data: { name: `GPS ${act.name} (${act.imei}) · ${act.items ?? "Plataforma"}` } });
  const sub = await stripe.subscriptions.create({
    customer: act.stripeCustomerId,
    default_payment_method: act.paymentMethodId,
    items: [{ price: price.id }],
    payment_behavior: "error_if_incomplete",
    metadata: { kind: "activation", activationId: act.id },
  });
  return sub.id;
}

async function activate(act: DeviceActivation): Promise<void> {
  let subscriptionId: string | null;
  try {
    subscriptionId = await charge(act);
  } catch (e) {
    const error = String((e as Error).message).slice(0, 2000);
    await prisma.deviceActivation.update({ where: { id: act.id }, data: { status: "FAILED", error } });
    await notify("payment_failed", audience(act), { subject: `No pudimos cobrar la activación de ${act.name}`, title: "Pago rechazado", lines: [`Tu equipo ${act.name} ya está conectado, pero la tarjeta fue rechazada.`, "Entra de nuevo y activa el equipo con otra tarjeta."], cta: { label: "Activa tu dispositivo ahora", url: `${appUrl()}/activar` } });
    return;
  }
  const expiresAt = addYear(new Date());
  await addDeviceUser(act.deviceId!, act.gpswoxUserId);
  await setDeviceExpiration(act.deviceId!, expiresAt);
  await prisma.deviceActivation.update({ where: { id: act.id }, data: { status: "ACTIVE", subscriptionId, activatedAt: new Date(), expiresAt, error: null } });
  await notify("activation_active", audience(act), { subject: `Tu equipo ${act.name} ya está activo`, title: "Equipo activo", lines: [`${act.name} ya aparece en tu cuenta de rastreo.`, act.amountCents > 0 ? `Se cobraron ${formatMoney(act.amountCents)} por 12 meses. Se renueva solo el ${formatDate(expiresAt)}.` : `Activo hasta el ${formatDate(expiresAt)}.`] });
  const sim = await prisma.simCard.findFirst({ where: { imei: act.imei, goneAt: null } });
  if (sim) {
    await prisma.deviceActivation.update({ where: { id: act.id }, data: { simIccid: sim.iccid } });
    await sendEmail(BRAND.supportEmail, `Equipo activado con una SIM tuya: ${sim.iccid}`, emailHtml("SIM tuya en un equipo nuevo", [`${act.name} (IMEI ${act.imei}) de ${act.email} usa la SIM ${sim.iccid}.`, "Revisa su renovación en la ficha de la SIM."], { label: "Abrir ficha de la SIM", url: `${appUrl()}/admin/sim/${sim.iccid}` }));
  }
}

// Runs every 15 minutes: counts 5 hours from the first signal and charges if the device is still reporting.
export async function runActivations(now = new Date()): Promise<{ waiting: number; signaled: number; activated: number }> {
  const waiting = await prisma.deviceActivation.findMany({ where: { status: "WAITING_SIGNAL", deviceId: { not: null } } });
  const signals = await lastSignals(waiting.map((a) => a.deviceId!));
  let signaled = 0, activated = 0;
  for (const act of waiting) {
    const last = signals.get(act.deviceId!);
    const online = !!last && now.getTime() - last.getTime() < ONLINE_MS && last.getTime() >= act.createdAt.getTime() - ONLINE_MS;
    if (!online) continue;
    if (!act.firstSignalAt) {
      await prisma.deviceActivation.update({ where: { id: act.id }, data: { firstSignalAt: now } });
      signaled++;
      continue;
    }
    if (now.getTime() - act.firstSignalAt.getTime() < STABLE_HOURS * 3600_000) continue;
    try {
      await activate(act);
      activated++;
    } catch (e) {
      await prisma.deviceActivation.update({ where: { id: act.id }, data: { error: String((e as Error).message).slice(0, 2000) } });
    }
  }
  return { waiting: waiting.length, signaled, activated };
}

const invoiceSubscription = (inv: Stripe.Invoice): string | null => {
  const legacy = (inv as unknown as { subscription?: string | { id: string } | null }).subscription;
  const sub = inv.parent?.subscription_details?.subscription ?? legacy ?? null;
  return typeof sub === "string" ? sub : (sub?.id ?? null);
};

// Yearly renewals: paid → one more year; failed → the device expires.
export async function applyActivationInvoice(inv: Stripe.Invoice, paid: boolean): Promise<void> {
  const subId = invoiceSubscription(inv);
  if (!subId || inv.billing_reason === "subscription_create") return;
  const act = await prisma.deviceActivation.findUnique({ where: { subscriptionId: subId } });
  if (!act?.deviceId) return;
  if (paid) {
    const expiresAt = addYear(act.expiresAt && act.expiresAt > new Date() ? act.expiresAt : new Date());
    await setDeviceExpiration(act.deviceId, expiresAt);
    await prisma.deviceActivation.update({ where: { id: act.id }, data: { status: "ACTIVE", expiresAt } });
  } else {
    await setDeviceExpiration(act.deviceId, new Date());
    await prisma.deviceActivation.update({ where: { id: act.id }, data: { status: "PAST_DUE" } });
    await notify("payment_failed", audience(act), { subject: `No pudimos renovar ${act.name}`, title: "Renovación rechazada", lines: [`La renovación anual de ${act.name} fue rechazada y el equipo quedó vencido.`, "Actualiza tu tarjeta para reactivarlo."] });
  }
}
