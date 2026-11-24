import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AssistantChat } from "../../asistente/chat";
import { AdminShell } from "../admin-shell";

export const dynamic = "force-dynamic";

const SUGGESTIONS = ["¿Cómo está el sistema hoy?", "¿Qué equipos no reportan desde ayer?", "¿Qué membresías vencen esta semana?", "Activa la notificación de encendido al camión"];

export default async function AdminAsistentePage() {
  if (!(await getSession("admin"))) redirect("/admin");
  return (
    <AdminShell>
      <h1 className="page-title">Asistente</h1>
      <p className="hint" style={{ margin: "6px 0 0" }}>Pregúntale por cualquier cliente, vehículo o por el estado del sistema, o dale una orden: crear o apagar alertas, mandarlas al WhatsApp del cliente, suspender o activar cuentas. Antes de cambiar algo te pide que confirmes con &quot;sí&quot;.</p>
      <AssistantChat panel="admin" suggestions={SUGGESTIONS} />
    </AdminShell>
  );
}
