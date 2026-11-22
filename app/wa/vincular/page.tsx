import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { DIRECT_WA, readLinkToken } from "@/lib/wa";
import { LinkForm } from "./form";

export const metadata: Metadata = { title: "Conectar WhatsApp", robots: { index: false } };

export default async function VincularPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const token = (await searchParams).t ?? "";
  const target = readLinkToken(token);
  const company = !target ? null : target.companyId === DIRECT_WA ? { name: "GPS Link" } : await prisma.company.findUnique({ where: { id: target.companyId }, select: { name: true } });
  return (
    <div className="wrap">
      <div className="panel narrow" style={{ marginTop: 40 }}>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Conectar WhatsApp{company ? ` · ${company.name}` : ""}</h1>
        {target && company ? (
          <>
            <p className="hint" style={{ marginBottom: 14 }}>Entra con el usuario de tu plataforma de rastreo para que el asistente te responda por WhatsApp (número terminado en {target.phone.slice(-4)}).</p>
            <LinkForm token={token} />
          </>
        ) : (
          <div className="err">Este enlace venció o no es válido. Escribe otra vez al WhatsApp para recibir uno nuevo.</div>
        )}
      </div>
    </div>
  );
}
