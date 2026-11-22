"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { TicketError, adminReply } from "@/lib/tickets";

async function requireAdmin() {
  if (!(await getSession("admin"))) redirect("/admin");
}

export async function adminReplyAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  let sent: boolean;
  try {
    sent = await adminReply(id, { body: String(formData.get("body") ?? ""), file: formData.get("photo") });
  } catch (e) {
    if (e instanceof TicketError) redirect(e.message === "ticket" ? "/admin/tickets" : `/admin/tickets/${id}?error=${e.message}`);
    throw e;
  }
  redirect(`/admin/tickets/${id}?ok=${sent ? "enviado" : "sin-correo"}`);
}

export async function adminStatusAction(formData: FormData) {
  await requireAdmin();
  const ticket = await prisma.supportTicket.findUnique({ where: { id: String(formData.get("id") ?? "") } });
  if (!ticket) redirect("/admin/tickets");
  const reopen = ticket.status === "cerrado";
  await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: reopen ? "abierto" : "cerrado" } });
  redirect(`/admin/tickets/${ticket.id}?ok=${reopen ? "reabierto" : "cerrado"}`);
}
