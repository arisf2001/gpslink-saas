import type { Company, SupportTicket } from "@prisma/client";
import { pushAdmin } from "./push";
import { brandHasOwnLogin } from "./brand-host";
import { BRAND, appUrl } from "./config";
import { prisma } from "./db";
import { emailHtml, sendEmail } from "./notify";
import { ImageError, saveImage } from "./site-media";

export const TICKET_STATUS: Record<string, string> = { abierto: "Esperando respuesta", respondido: "Respondido", cerrado: "Cerrado" };
export class TicketError extends Error {}
export type Author = { name: string; email: string | null };
export type TicketInput = { body: string; file: FormDataEntryValue | null };

type BrandCompany = Pick<Company, "id" | "name" | "email" | "websiteUrl" | "brandColor" | "siteData">;

export function ticketAccountUrl(company: BrandCompany, ticketId: string): string {
  const base = brandHasOwnLogin(company) ? new URL(company.websiteUrl!).origin : appUrl();
  return `${base}/cuenta/soporte/${ticketId}`;
}

async function photo(companyId: string, file: FormDataEntryValue | null): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  try {
    return await saveImage(companyId, file);
  } catch (e) {
    if (e instanceof ImageError) throw new TicketError("foto");
    throw e;
  }
}

function cleanBody(body: string): string {
  const text = body.trim().slice(0, 5000);
  if (!text) throw new TicketError("mensaje");
  return text;
}

async function tellAdmin(company: BrandCompany, ticket: SupportTicket, author: Author, body: string, isNew: boolean) {
  const subject = `${isNew ? "Ticket nuevo" : "Respuesta en ticket"} de ${company.name}: ${ticket.subject}`;
  const html = emailHtml(subject, [`${author.name} escribió:`, body, ticket.device ? `Vehículo: ${ticket.device}` : ""].filter(Boolean), { label: "Ver ticket", url: `${appUrl()}/admin/tickets/${ticket.id}` });
  await sendEmail(BRAND.supportEmail, subject, html, { replyTo: author.email ?? company.email }).catch(() => null);
  await pushAdmin({ title: subject, body: `${author.name}: ${body.slice(0, 180)}`, url: `/admin/tickets/${ticket.id}`, tag: `ticket:${ticket.id}` });
}

export async function createTicket(company: BrandCompany, author: Author, input: TicketInput & { subject: string; device: string }): Promise<string> {
  const subject = input.subject.trim().slice(0, 150);
  if (subject.length < 3) throw new TicketError("asunto");
  const body = cleanBody(input.body);
  const image = await photo(company.id, input.file);
  const ticket = await prisma.supportTicket.create({
    data: {
      companyId: company.id,
      subject,
      device: input.device.trim().slice(0, 120) || null,
      messages: { create: { author: author.name.slice(0, 120), authorEmail: author.email, body, image } },
    },
  });
  await tellAdmin(company, ticket, author, body, true);
  return ticket.id;
}

export async function companyReply(company: BrandCompany, ticket: SupportTicket, author: Author, input: TicketInput): Promise<void> {
  const body = cleanBody(input.body);
  const image = await photo(company.id, input.file);
  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { status: "abierto", messages: { create: { author: author.name.slice(0, 120), authorEmail: author.email, body, image } } },
  });
  await tellAdmin(company, ticket, author, body, false);
}

// Returns false when the brand could not be emailed (the answer is saved anyway).
export async function adminReply(ticketId: string, input: TicketInput): Promise<boolean> {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, include: { company: true, messages: { where: { fromAdmin: false }, select: { authorEmail: true } } } });
  if (!ticket) throw new TicketError("ticket");
  const body = cleanBody(input.body);
  const image = await photo(ticket.companyId, input.file);
  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { status: "respondido", messages: { create: { fromAdmin: true, author: BRAND.name, body, image } } },
  });
  const to = [...new Set([ticket.company.email, ...ticket.messages.map((m) => m.authorEmail)].filter((e): e is string => !!e).map((e) => e.toLowerCase()))];
  const subject = `${BRAND.name} respondió tu ticket: ${ticket.subject}`;
  const html = emailHtml(subject, [body], { label: "Ver ticket", url: ticketAccountUrl(ticket.company, ticket.id) });
  const results = await Promise.all(to.map((e) => sendEmail(e, subject, html).catch(() => ({ ok: false }))));
  return results.some((r) => r.ok);
}
