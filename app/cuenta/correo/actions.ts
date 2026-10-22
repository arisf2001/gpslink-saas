"use server";

import { redirect } from "next/navigation";
import { brandMail } from "@/lib/brand-mail";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function company() {
  const id = await getSession("company");
  if (!id) redirect("/cuenta");
  const found = await prisma.company.findUnique({ where: { id } });
  if (!found?.gpswoxUserId) redirect("/cuenta/correo?error=sin-usuario");
  return { ...found, gpswoxUserId: found.gpswoxUserId };
}

export async function saveBrandMailAction(formData: FormData) {
  const c = await company();
  const fromName = String(formData.get("fromName") ?? "").trim().slice(0, 80);
  const replyTo = String(formData.get("replyTo") ?? "").trim().toLowerCase();
  if (replyTo && !EMAIL.test(replyTo)) redirect("/cuenta/correo?error=correo");
  try {
    await brandMail(c.gpswoxUserId, { fromName: fromName || c.name, replyTo });
  } catch {
    redirect("/cuenta/correo?error=plataforma");
  }
  redirect("/cuenta/correo?ok=guardado");
}

export async function testBrandMailAction(formData: FormData) {
  const c = await company();
  const to = String(formData.get("testTo") ?? "").trim() || c.email;
  if (!EMAIL.test(to)) redirect("/cuenta/correo?error=correo");
  let ok = false;
  try {
    ok = (await brandMail(c.gpswoxUserId, { testTo: to })).test?.ok ?? false;
  } catch {
    redirect("/cuenta/correo?error=plataforma");
  }
  redirect(ok ? `/cuenta/correo?ok=prueba&to=${encodeURIComponent(to)}` : "/cuenta/correo?error=envio");
}
