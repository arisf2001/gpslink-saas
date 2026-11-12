import { redirect } from "next/navigation";
import { prisma } from "./db";
import { getSession } from "./session";

// Tabs of the white label's account panel that the owner can hide per company.
export const TAB_OPTIONS = [
  ["clientes", "Mis clientes"],
  ["equipos", "Mis equipos"],
  ["planes", "Mis planes"],
  ["whatsapp", "Mi WhatsApp"],
  ["correo", "Mi correo"],
  ["web", "Mi web"],
  ["permisos", "Qué ven mis clientes"],
] as const;
export type TabKey = (typeof TAB_OPTIONS)[number][0];

export function hiddenTabSet(value: string | null | undefined): Set<string> {
  return new Set((value ?? "").split(",").filter(Boolean));
}

export async function requireTab(key: TabKey): Promise<void> {
  const id = await getSession("company");
  if (!id) return;
  const company = await prisma.company.findUnique({ where: { id }, select: { hiddenTabs: true } });
  if (hiddenTabSet(company?.hiddenTabs).has(key)) redirect("/cuenta");
}
