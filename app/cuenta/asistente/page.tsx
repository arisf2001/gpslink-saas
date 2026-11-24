import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireTab } from "@/lib/tabs";
import { AssistantChat } from "../../asistente/chat";
import { SiteNav } from "../../site-nav";
import { CuentaNav } from "../cuenta-nav";

export const dynamic = "force-dynamic";

const SUGGESTIONS = ["¿Cómo están mis clientes y equipos?", "¿Qué equipos no reportan desde ayer?", "¿Qué clientes vencen esta semana?", "Activa la notificación de encendido a un vehículo"];

export default async function CuentaAsistentePage() {
  const companyId = await getSession("company");
  await requireTab("asistente");
  const company = companyId ? await prisma.company.findUnique({ where: { id: companyId }, select: { gpswoxUserId: true } }) : null;
  if (!company) redirect("/cuenta");
  return (
    <>
      <SiteNav />
      <div className="wrap" style={{ maxWidth: 1060, paddingBottom: 40 }}>
        <h1 className="page-title">Asistente</h1>
        <CuentaNav active="asistente" />
        <p className="hint">Pregúntale por tus clientes, sus vehículos y sus vencimientos, o dale una orden: crear o apagar alertas, mandarlas al WhatsApp de tu cliente, suspender o activar a tus clientes. Solo ve y cambia tus propios clientes, y antes de cambiar algo te pide que confirmes con &quot;sí&quot;.</p>
        {company.gpswoxUserId ? <AssistantChat panel="company" suggestions={SUGGESTIONS} /> : <div className="err">Tu cuenta todavía no tiene plataforma de rastreo.</div>}
      </div>
    </>
  );
}
