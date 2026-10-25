"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, getStaffId } from "@/lib/session";
import { TicketError, companyReply, createTicket, type Author } from "@/lib/tickets";

async function requireCompany() {
  const id = await getSession("company");
  const company = id ? await prisma.company.findUnique({ where: { id } }) : null;
  if (!company) redirect("/cuenta");
  const staffId = await getStaffId();
  const staff = staffId ? await prisma.companyUser.findUnique({ where: { id: staffId } }) : null;
  const author: Author = staff ? { name: staff.name, email: staff.email } : { name: company.contactName || company.name, email: company.email };
  return { company, author };
}

async function ownTicket(companyId: string, formData: FormData) {
  const ticket = await prisma.supportTicket.findFirst({ where: { id: String(formData.get("id") ?? ""), companyId } });
  if (!ticket) redirect("/cuenta/soporte");
  return ticket;
}

export async function createTicketAction(formData: FormData) {
  const { company, author } = await requireCompany();
  let id: string;
  try {
    id = await createTicket(company, author, {
      subject: String(formData.get("subject") ?? ""),
      device: String(formData.get("device") ?? ""),
      body: String(formData.get("body") ?? ""),
      file: formData.get("photo"),
    });
  } catch (e) {
    if (e instanceof TicketError) redirect(`/cuenta/soporte?error=${e.message}`);
    throw e;
  }
  redirect(`/cuenta/soporte/${id}?ok=creado`);
}

export async function replyTicketAction(formData: FormData) {
  const { company, author } = await requireCompany();
  const ticket = await ownTicket(company.id, formData);
  try {
    await companyReply(company, ticket, author, { body: String(formData.get("body") ?? ""), file: formData.get("photo") });
  } catch (e) {
    if (e instanceof TicketError) redirect(`/cuenta/soporte/${ticket.id}?error=${e.message}`);
    throw e;
  }
  redirect(`/cuenta/soporte/${ticket.id}?ok=enviado`);
}

export async function closeTicketAction(formData: FormData) {
  const { company } = await requireCompany();
  const ticket = await ownTicket(company.id, formData);
  const reopen = ticket.status === "cerrado";
  await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: reopen ? "abierto" : "cerrado" } });
  redirect(`/cuenta/soporte/${ticket.id}?ok=${reopen ? "reabierto" : "cerrado"}`);
}
