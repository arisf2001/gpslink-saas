import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession, getStaffId } from "@/lib/session";
import { hiddenTabSet } from "@/lib/tabs";

const LINKS = [
  { key: "cuenta", href: "/cuenta", label: "Mi cuenta" },
  { key: "clientes", href: "/cuenta/clientes", label: "Mis clientes" },
  { key: "equipos", href: "/cuenta/equipos", label: "Mis equipos" },
  { key: "planes", href: "/cuenta/planes", label: "Mis planes" },
  { key: "permisos", href: "/cuenta/permisos", label: "Qué ven mis clientes" },
  { key: "whatsapp", href: "/cuenta/whatsapp", label: "Mi WhatsApp" },
  { key: "correo", href: "/cuenta/correo", label: "Mi correo" },
  { key: "web", href: "/cuenta/web", label: "Mi web" },
  { key: "admins", href: "/cuenta/administradores", label: "Administradores" },
] as const;

export async function CuentaNav({ active }: { active: (typeof LINKS)[number]["key"] }) {
  const id = await getSession("company");
  const company = id ? await prisma.company.findUnique({ where: { id }, select: { hiddenTabs: true } }) : null;
  const hidden = hiddenTabSet(company?.hiddenTabs);
  if (await getStaffId()) hidden.add("admins");
  return (
    <div className="tabs" style={{ margin: "8px 0 16px" }}>
      {LINKS.filter((l) => !hidden.has(l.key)).map((l) => (
        <Link key={l.key} href={l.href} className={`tab${active === l.key ? " on" : ""}`}>{l.label}</Link>
      ))}
    </div>
  );
}
