import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Company, CompanyUser } from "@prisma/client";
import { accountLoginUrl } from "./brand-host";
import { prisma } from "./db";
import { emailHtml, sendEmail } from "./notify";

export class CompanyUserError extends Error {}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function verifyStaffLogin(email: string, password: string): Promise<CompanyUser | null> {
  const user = await prisma.companyUser.findUnique({ where: { email } });
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) return null;
  return prisma.companyUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
}

async function sendAccess(company: Company, user: CompanyUser, password: string, isNew: boolean): Promise<boolean> {
  const url = accountLoginUrl(company);
  const result = await sendEmail(
    user.email,
    `${company.name}: ${isNew ? "tu acceso de administrador" : "tu nueva contraseña"}`,
    emailHtml(isNew ? `Bienvenido a ${company.name}` : "Tu nueva contraseña", [
      isNew
        ? `${company.name} te agregó como administrador de su cuenta. Desde ahí manejas sus clientes, equipos, planes, correo y web.`
        : `Te pusieron una contraseña nueva para entrar a la cuenta de ${company.name}.`,
      `Entra en: ${url}`,
      `Usuario: ${user.email}`,
      `Contraseña: ${password}`,
    ], { label: "Entrar a la cuenta", url }, { name: company.name, contact: company.email }),
    { fromName: company.name, replyTo: company.email },
  );
  return result.ok;
}

export async function addCompanyUser(company: Company, input: { name: string; email: string }): Promise<boolean> {
  const name = input.name.trim().slice(0, 80);
  const email = input.email.trim().toLowerCase().slice(0, 200);
  if (!name) throw new CompanyUserError("nombre");
  if (!EMAIL.test(email)) throw new CompanyUserError("correo");
  if ((await prisma.companyUser.findUnique({ where: { email } })) || (await prisma.company.findUnique({ where: { email } }))) throw new CompanyUserError("usado");
  const password = randomBytes(9).toString("base64url");
  const user = await prisma.companyUser.create({ data: { companyId: company.id, name, email, passwordHash: await bcrypt.hash(password, 10) } });
  return sendAccess(company, user, password, true);
}

export async function resetCompanyUserPassword(company: Company, user: CompanyUser): Promise<boolean> {
  const password = randomBytes(9).toString("base64url");
  const updated = await prisma.companyUser.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 10), active: true } });
  return sendAccess(company, updated, password, false);
}
