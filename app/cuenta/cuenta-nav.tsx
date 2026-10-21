import Link from "next/link";

const LINKS = [
  { key: "cuenta", href: "/cuenta", label: "Mi cuenta" },
  { key: "clientes", href: "/cuenta/clientes", label: "Mis clientes" },
  { key: "planes", href: "/cuenta/planes", label: "Mis planes" },
  { key: "whatsapp", href: "/cuenta/whatsapp", label: "Mi WhatsApp" },
] as const;

export function CuentaNav({ active }: { active: (typeof LINKS)[number]["key"] }) {
  return (
    <div className="tabs" style={{ margin: "8px 0 16px" }}>
      {LINKS.map((l) => (
        <Link key={l.key} href={l.href} className={`tab${active === l.key ? " on" : ""}`}>{l.label}</Link>
      ))}
    </div>
  );
}
