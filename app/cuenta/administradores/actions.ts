"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { CompanyUserError, addCompanyUser, resetCompanyUserPassword } from "@/lib/company-users";
import { getSession, getStaffId } from "@/lib/session";

async function requireOwner() {
  const id = await getSession("company");
  const company = id && !(await getStaffId()) ? await prisma.company.findUnique({ where: { id } }) : null;
  if (!company) redirect("/cuenta");
  return company;
}

async function ownUser(companyId: string, formData: FormData) {
  const user = await prisma.companyUser.findFirst({ where: { id: String(formData.get("id") ?? ""), companyId } });
  if (!user) redirect("/cuenta/administradores");
  return user;
}

export async function addAdminAction(formData: FormData) {
  const company = await requireOwner();
  let sent: boolean;
  try {
    sent = await addCompanyUser(company, { name: String(formData.get("name") ?? ""), email: String(formData.get("email") ?? "") });
  } catch (e) {
    if (e instanceof CompanyUserError) redirect(`/cuenta/administradores?error=${e.message}`);
    throw e;
  }
  redirect(`/cuenta/administradores?ok=${sent ? "creado" : "creado-sin-correo"}`);
}

export async function toggleAdminAction(formData: FormData) {
  const company = await requireOwner();
  const user = await ownUser(company.id, formData);
  await prisma.companyUser.update({ where: { id: user.id }, data: { active: !user.active } });
  redirect(`/cuenta/administradores?ok=${user.active ? "desactivado" : "activado"}`);
}

export async function resetAdminAction(formData: FormData) {
  const company = await requireOwner();
  const user = await ownUser(company.id, formData);
  const sent = await resetCompanyUserPassword(company, user);
  redirect(`/cuenta/administradores?ok=${sent ? "clave" : "clave-sin-correo"}`);
}

export async function deleteAdminAction(formData: FormData) {
  const company = await requireOwner();
  const user = await ownUser(company.id, formData);
  await prisma.companyUser.delete({ where: { id: user.id } });
  redirect("/cuenta/administradores?ok=quitado");
}
