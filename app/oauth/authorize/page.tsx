import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { AuthorizeForm } from "./form";
import { parseAuthorize } from "./request";

export const metadata: Metadata = { title: "Conectar tu cuenta", robots: { index: false } };

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const parsed = await parseAuthorize(await searchParams);
  if ("error" in parsed) {
    return (
      <main style={{ maxWidth: 440, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 22 }}>No se pudo conectar</h1>
        <p>{parsed.error}</p>
      </main>
    );
  }
  const company = parsed.brand ? await prisma.company.findUnique({ where: { subdomain: parsed.brand }, select: { name: true, brandColor: true } }) : null;
  const brandName = company?.name ?? "GPS Link";
  const color = company?.brandColor || "#0F4C5C";
  return (
    <main style={{ maxWidth: 440, margin: "60px auto", padding: "0 20px" }}>
      <div style={{ fontWeight: 800, fontSize: 24, color }}>{brandName}</div>
      <h1 style={{ fontSize: 20, margin: "14px 0 8px" }}>Conectar {parsed.clientName} con tu cuenta</h1>
      <p style={{ color: "#555", lineHeight: 1.5 }}>
        Entra con el mismo usuario y contraseña de tu plataforma de rastreo. {parsed.clientName} podrá <b>consultar</b> tus vehículos: ubicación, batería,
        señal e historial. <b>No podrá apagar ni encender motores</b> ni cambiar nada.
      </p>
      <AuthorizeForm req={parsed} color={color} />
      <p style={{ color: "#888", fontSize: 13, marginTop: 16 }}>Puedes desconectarlo cuando quieras desde los ajustes de {parsed.clientName}.</p>
    </main>
  );
}
