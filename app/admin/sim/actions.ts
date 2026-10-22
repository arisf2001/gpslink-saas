"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseMoneyToCents } from "@/lib/format";
import { getSession } from "@/lib/session";
import { validIccid } from "@/lib/sim/carriers";
import { markRenewalDone, runMonthly } from "@/lib/sim/notify";
import { agencyByDevice, deviceOwner, recordEvent, syncSims } from "@/lib/sim/sync";
import { telebayActivate, telebaySwitch } from "@/lib/sim/telebay";

async function requireAdmin() {
  if (!(await getSession("admin"))) redirect("/admin");
}

export async function saveCarrierAction(formData: FormData) {
  await requireAdmin();
  const code = String(formData.get("code") ?? "");
  const renew = parseMoneyToCents(String(formData.get("renew") ?? ""));
  const react = parseMoneyToCents(String(formData.get("reactivate") ?? ""));
  const agencyRenew = parseMoneyToCents(String(formData.get("agencyRenew") ?? ""));
  const agencyReact = parseMoneyToCents(String(formData.get("agencyReactivate") ?? ""));
  const prefixes = String(formData.get("prefixes") ?? "").split(",").map((p) => p.replace(/\D/g, "")).filter(Boolean).join(",");
  if (renew === null || react === null || agencyRenew === null || agencyReact === null || !prefixes) redirect("/admin/planes?error=sim#sim");
  await prisma.simCarrier.update({ where: { code }, data: { renewCents: renew, reactivateCents: react, agencyRenewCents: agencyRenew, agencyReactivateCents: agencyReact, iccidPrefixes: prefixes } });
  revalidatePath("/admin/sim");
  redirect("/admin/planes?ok=sim#sim");
}

export async function syncNowAction() {
  await requireAdmin();
  try {
    await syncSims();
  } catch (e) {
    console.error("[sim] sync:", (e as Error).message);
    redirect("/admin/sim?error=sync");
  }
  const { failed } = await runMonthly(new Date(), true);
  revalidatePath("/admin/sim");
  redirect(failed.length ? `/admin/sim?error=esim&prov=${encodeURIComponent(failed.join(", "))}` : "/admin/sim?ok=sync");
}

export async function linkSimAction(formData: FormData) {
  await requireAdmin();
  const iccid = String(formData.get("iccid") ?? "").trim();
  const deviceId = Number(formData.get("deviceId"));
  const card = validIccid(iccid) ? await prisma.simCard.findUnique({ where: { iccid } }) : null;
  const owner = card && deviceId > 0 ? await deviceOwner(deviceId).catch(() => null) : null;
  if (!card || !owner) redirect(`/admin/sim?f=sin-equipo&error=link`);
  const agency = (await agencyByDevice()).get(owner.deviceId) ?? null;
  await prisma.simCard.update({
    where: { iccid },
    data: { companyId: agency, deviceId: owner.deviceId, deviceName: owner.deviceName, ownerUserId: owner.userId, ownerEmail: owner.email, ownerPhone: owner.phone, linkSource: "manual" },
  });
  await recordEvent(iccid, "device", `Equipo asignado a mano: ${owner.deviceName}`);
  revalidatePath("/admin/sim");
  redirect("/admin/sim?f=sin-equipo&ok=link");
}

export async function markDoneAction(formData: FormData) {
  await requireAdmin();
  await markRenewalDone(String(formData.get("id") ?? ""));
  revalidatePath("/admin/sim");
  redirect("/admin/sim?f=pagadas&ok=done");
}

export async function saveSupplierAction(formData: FormData) {
  if (!(await getSession("admin"))) redirect("/admin");
  const code = String(formData.get("code") ?? "");
  const field = (k: string) => String(formData.get(k) ?? "").trim().slice(0, k === "supplierNotes" ? 5000 : 190) || null;
  await prisma.simCarrier.update({
    where: { code },
    data: { supplierContact: field("supplierContact"), supplierEmail: field("supplierEmail"), supplierPhone: field("supplierPhone"), supplierWeb: field("supplierWeb"), supplierNotes: field("supplierNotes") },
  });
  revalidatePath("/admin/sim");
  redirect(`/admin/sim?f=${encodeURIComponent(String(formData.get("f") ?? "hoy"))}&ok=suplidor#suplidor`);
}

export async function saveSimInfoAction(formData: FormData) {
  await requireAdmin();
  const iccid = String(formData.get("iccid") ?? "").trim();
  if (!validIccid(iccid)) redirect("/admin/sim?f=todas");
  const back = String(formData.get("back") ?? "");
  const self = `/admin/sim/${iccid}?back=${encodeURIComponent(back)}`;
  const text = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max) || null;
  const price = (k: string): number | null | false => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : (parseMoneyToCents(v) ?? false);
  };
  const renewCents = price("renew");
  const reactivateCents = price("reactivate");
  if (renewCents === false || reactivateCents === false) redirect(`${self}&error=precio`);
  await prisma.simCard.update({
    where: { iccid },
    data: { nickname: text("nickname", 190)?.replace(/\s+/g, " ") ?? null, customerName: text("customerName", 190), notes: text("notes", 5000), renewCents, reactivateCents },
  });
  revalidatePath("/admin/sim");
  redirect(`${self}&ok=info`);
}

const COMMANDS = {
  activate: { from: [1], label: "Activar plan", run: (iccid: string) => telebayActivate(iccid) },
  suspend: { from: [2], label: "Suspender", run: (iccid: string) => telebaySwitch(iccid, "0") },
  resume: { from: [3], label: "Reactivar", run: (iccid: string) => telebaySwitch(iccid, "1") },
};

export async function simCommandAction(formData: FormData) {
  await requireAdmin();
  const iccid = String(formData.get("iccid") ?? "").trim();
  const back = String(formData.get("back") ?? "");
  const base = back.startsWith("/admin/sim") && !back.startsWith("//") ? back : "/admin/sim?f=todas";
  const go: (q: string, msg: string) => never = (q, msg) => redirect(`${base}&${q}&msg=${encodeURIComponent(msg)}`);
  const cmd = COMMANDS[String(formData.get("op") ?? "") as keyof typeof COMMANDS];
  const card = validIccid(iccid) ? await prisma.simCard.findUnique({ where: { iccid } }) : null;
  if (!cmd || !card || card.carrierCode !== "telebay" || !cmd.from.includes(card.status)) go("error=cmd", "esa acción no corresponde al estado actual de la SIM.");
  if (String(formData.get("confirm") ?? "").trim() !== iccid.slice(-4)) go("error=cmd", "los 4 números de confirmación no coinciden con el ICCID.");
  let failure: string | null = null;
  try {
    const r = await cmd.run(iccid);
    if (r.code !== 0) failure = `Telebay respondió: ${r.msg || `código ${r.code}`}`;
  } catch (e) {
    failure = (e as Error).message;
  }
  await recordEvent(iccid, "command", `${cmd.label} desde el panel: ${failure ? `rechazado (${failure})` : "aceptado por Telebay"}`);
  if (failure) go("error=cmd", failure);
  await syncSims().catch((e) => console.error("[sim] sync after command:", (e as Error).message));
  revalidatePath("/admin/sim");
  go("ok=cmd", `${cmd.label}: Telebay aceptó la orden para la SIM ${iccid}.`);
}
