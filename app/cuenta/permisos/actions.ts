"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { permSetFromForm, platformPerms } from "@/lib/perms";
import { getSession } from "@/lib/session";
import { requireTab } from "@/lib/tabs";

export async function saveClientPermsAction(formData: FormData) {
  const id = await getSession("company");
  if (!id) redirect("/cuenta");
  await requireTab("permisos");
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company?.gpswoxUserId) redirect("/cuenta/permisos?error=sin-usuario");
  const set = permSetFromForm(formData);
  const clientId = String(formData.get("clientId") ?? "");
  let failed = false;

  if (clientId) {
    const client = await prisma.endClient.findFirst({ where: { id: clientId, companyId: company.id } });
    if (!client) redirect("/cuenta/permisos");
    try {
      await platformPerms(company.gpswoxUserId, { kind: "client", id: client.gpswoxUserId }, set);
    } catch {
      failed = true;
    }
    redirect(`/cuenta/permisos?cliente=${client.id}&${failed ? "error=plataforma" : "ok=cliente"}`);
  }

  await prisma.company.update({ where: { id: company.id }, data: { clientPerms: set } });
  if (formData.get("applyAll") !== "on") redirect("/cuenta/permisos?ok=guardado");
  let updated = 0;
  try {
    updated = (await platformPerms(company.gpswoxUserId, { kind: "clients" }, set)).updated ?? 0;
  } catch {
    failed = true;
  }
  redirect(failed ? "/cuenta/permisos?error=plataforma" : `/cuenta/permisos?ok=todos&n=${updated}`);
}
