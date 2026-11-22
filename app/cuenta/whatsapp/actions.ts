"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

async function companyId() {
  const id = await getSession("company");
  if (!id) redirect("/cuenta");
  return id;
}

export async function connectWhatsAppAction() {
  const id = await companyId();
  await prisma.waSession.upsert({ where: { companyId: id }, create: { companyId: id, want: true, status: "CONNECTING" }, update: { want: true, error: null } });
  redirect("/cuenta/whatsapp");
}

export async function disconnectWhatsAppAction() {
  const id = await companyId();
  await prisma.waSession.updateMany({ where: { companyId: id }, data: { want: false } });
  redirect("/cuenta/whatsapp");
}
