import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { alertSetting, deviceStatuses, problems, type DeviceStatus } from "@/lib/device-status";
import { getSession } from "@/lib/session";
import { DeviceTable, sortByProblems } from "../../device-table";
import { AdminShell } from "../admin-shell";
import { saveAlertSettingAction } from "./actions";

export const dynamic = "force-dynamic";

const KINDS: Record<string, string> = { low_battery: "Batería baja", power_cut: "Sin corriente", offline: "Sin reportar" };

export default async function AdminEquiposPage({ searchParams }: { searchParams: Promise<{ f?: string; ok?: string; error?: string }> }) {
  if (!(await getSession("admin"))) redirect("/admin");
  const { f = "problemas", ok, error } = await searchParams;
  const setting = await alertSetting();
  const cfg = { lowBattery: setting.lowBattery, offlineHours: setting.offlineHours };
  const now = new Date();
  let all: DeviceStatus[] = [];
  let readError = false;
  try {
    all = await deviceStatuses(null);
  } catch (e) {
    readError = true;
    console.error("[equipos]", (e as Error).message);
  }
  const [billed, alerts] = await Promise.all([
    prisma.billedDevice.findMany({ where: { removedAt: null }, select: { deviceId: true, company: { select: { name: true } } } }),
    prisma.deviceAlert.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const brandOf = new Map(billed.map((b) => [b.deviceId, b.company.name]));
  const reporting = all.filter((s) => s.lastReport);
  const withProblems = reporting.filter((s) => problems(s, now, cfg).length);
  const rows = sortByProblems(f === "todos" ? all : f === "reportan" ? reporting : withProblems, now, cfg);

  return (
    <AdminShell>
      <h1 className="page-title">Equipos</h1>
      {ok && <div className="ok" style={{ margin: "10px 0" }}>Ajustes guardados.</div>}
      {error && <div className="err" style={{ margin: "10px 0" }}>Revisa el número de WhatsApp y los límites.</div>}
      {readError && <div className="err" style={{ margin: "10px 0" }}>No pudimos leer los equipos de la plataforma de rastreo. Inténtalo en unos minutos.</div>}

      <div className="panel" style={{ margin: "14px 0" }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Avisos por WhatsApp</h2>
        <form action={saveAlertSettingAction} className="form" style={{ maxWidth: 560 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="enabled" defaultChecked={setting.enabled} style={{ width: "auto" }} /> Avisos activados</label>
          <label>Avisar cuando la batería baje de (%)<input name="lowBattery" defaultValue={setting.lowBattery} inputMode="numeric" /></label>
          <label>Avisar cuando lleve sin reportar más de (horas)<input name="offlineHours" defaultValue={setting.offlineHours} inputMode="numeric" /></label>
          <label>Tu WhatsApp para recibir los avisos de todos los equipos<input name="ownerPhone" defaultValue={setting.ownerPhone ?? ""} placeholder="Ej. 18095551234 (vacío = no recibir)" /></label>
          <p className="hint">También se avisa cuando un equipo se desconecta de la corriente. Le llega al cliente dueño del vehículo (si conectó su WhatsApp con el asistente), a su marca blanca por su WhatsApp QR y a ti por tu WhatsApp de Meta. Cada aviso sale una sola vez cuando empieza el problema, como máximo una vez al día.</p>
          <button className="btn sm dark">Guardar</button>
        </form>
      </div>

      <div className="row" style={{ justifyContent: "space-between", margin: "14px 0 10px" }}>
        <div className="tabs" style={{ margin: 0 }}>
          <Link href="/admin/equipos?f=problemas" className={`tab${f === "problemas" ? " on" : ""}`}>Con problemas ({withProblems.length})</Link>
          <Link href="/admin/equipos?f=reportan" className={`tab${f === "reportan" ? " on" : ""}`}>Que reportan ({reporting.length})</Link>
          <Link href="/admin/equipos?f=todos" className={`tab${f === "todos" ? " on" : ""}`}>Todos ({all.length})</Link>
        </div>
      </div>
      <div className="panel"><DeviceTable rows={rows} now={now} cfg={cfg} brandOf={brandOf} /></div>

      <div className="panel" style={{ margin: "14px 0" }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Últimos avisos</h2>
        <table className="t">
          <thead><tr><th>Fecha</th><th>Equipo</th><th>Aviso</th><th>Enviado a</th></tr></thead>
          <tbody>
            {alerts.length === 0 && <tr><td colSpan={4} className="hint">Todavía no ha salido ningún aviso.</td></tr>}
            {alerts.map((a) => (
              <tr key={a.id}>
                <td>{a.createdAt.toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "short", timeStyle: "short" })}</td>
                <td>{a.deviceName}</td>
                <td>{KINDS[a.kind] ?? a.kind}</td>
                <td>{a.sentTo} {a.sentTo === 1 ? "número" : "números"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
