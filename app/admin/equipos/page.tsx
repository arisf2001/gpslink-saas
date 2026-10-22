import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { alertSetting, deviceStatuses, problems, type DeviceStatus } from "@/lib/device-status";
import { CHANNEL_KEYS, NOTIFICATIONS, notificationRules } from "@/lib/notifications";
import { getSession } from "@/lib/session";
import { DeviceTable, sortByProblems } from "../../device-table";
import { AdminShell } from "../admin-shell";
import { saveNotificationsAction } from "./actions";

export const dynamic = "force-dynamic";

const KINDS: Record<string, string> = { low_battery: "Batería baja", power_cut: "Sin corriente", offline: "Sin reportar" };
const COLUMNS: Record<(typeof CHANNEL_KEYS)[number], string> = { clientWa: "Cliente: WhatsApp", clientEmail: "Cliente: correo", brandWa: "Marca blanca: WhatsApp", brandEmail: "Marca blanca: correo" };
const GROUPS = [["vehiculo", "Avisos del vehículo"], ["cuenta", "Avisos de cuenta y pagos"]] as const;

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
  const [rules, billed, alerts] = await Promise.all([
    notificationRules(),
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
      {error && <div className="err" style={{ margin: "10px 0" }}>Revisa los límites: batería de 1 a 90 % y horas de 1 a 720.</div>}
      {readError && <div className="err" style={{ margin: "10px 0" }}>No pudimos leer los equipos de la plataforma de rastreo. Inténtalo en unos minutos.</div>}

      <div className="row" style={{ justifyContent: "space-between", margin: "14px 0 10px" }}>
        <div className="tabs" style={{ margin: 0 }}>
          <Link href="/admin/equipos?f=problemas" className={`tab${f === "problemas" ? " on" : ""}`}>Con problemas ({withProblems.length})</Link>
          <Link href="/admin/equipos?f=reportan" className={`tab${f === "reportan" ? " on" : ""}`}>Que reportan ({reporting.length})</Link>
          <Link href="/admin/equipos?f=todos" className={`tab${f === "todos" ? " on" : ""}`}>Todos ({all.length})</Link>
          <Link href="/admin/equipos?f=notificaciones" className={`tab${f === "notificaciones" ? " on" : ""}`}>Notificaciones</Link>
        </div>
      </div>
      {f !== "notificaciones" && <div className="panel"><DeviceTable rows={rows} now={now} cfg={cfg} brandOf={brandOf} /></div>}

      {f === "notificaciones" && (
        <form action={saveNotificationsAction} className="panel">
          <p className="hint" style={{ marginBottom: 10 }}>
            Escoge quién recibe cada aviso y por dónde. <b>Cliente</b> es el dueño del vehículo: por WhatsApp le llega si conectó su WhatsApp con el asistente, y por correo al email de su cuenta de rastreo. <b>Marca blanca</b> es la agencia que cobra ese equipo: le llega a su WhatsApp QR y a su correo. Los avisos salen con el nombre de la marca (o GPS Link si es cliente directo). Los límites de cada alerta (velocidad, minutos, geocercas) los pone cada cliente en su cuenta de rastreo.
          </p>
          <div className="row" style={{ alignItems: "flex-end", marginBottom: 12 }}>
            <label className="row" style={{ fontSize: 14 }}><input type="checkbox" name="enabled" defaultChecked={setting.enabled} style={{ width: "auto" }} /> Notificaciones activadas</label>
            <label style={{ fontSize: 13 }}>Batería baja: menos de (%)<input name="lowBattery" defaultValue={setting.lowBattery} inputMode="numeric" style={{ width: 90 }} /></label>
            <label style={{ fontSize: 13 }}>Sin reportar: más de (horas)<input name="offlineHours" defaultValue={setting.offlineHours} inputMode="numeric" style={{ width: 90 }} /></label>
          </div>
          {GROUPS.map(([g, title]) => (
            <table key={g} className="t" style={{ marginBottom: 14 }}>
              <thead>
                <tr><th style={{ textAlign: "left" }}>{title}</th>{CHANNEL_KEYS.map((c) => <th key={c} style={{ textAlign: "center" }}>{COLUMNS[c]}</th>)}</tr>
              </thead>
              <tbody>
                {NOTIFICATIONS.filter((n) => n.group === g).map((n) => (
                  <tr key={n.key}>
                    <td>{n.label}</td>
                    {CHANNEL_KEYS.map((c) => (
                      <td key={c} style={{ textAlign: "center" }}><input type="checkbox" name={`${n.key}.${c}`} defaultChecked={rules.get(n.key)?.[c]} aria-label={`${n.label}: ${COLUMNS[c]}`} style={{ width: "auto" }} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
          <p className="hint" style={{ marginBottom: 10 }}>Los avisos de «revisión automática» los calcula la plataforma una vez por hora y salen una sola vez cuando empieza el problema (máximo uno al día). Los demás salen cuando la alerta del cliente se dispara en su cuenta de rastreo. Las zonas roja, azul y amarilla del mapa se agregarán aquí cuando estén listas.</p>
          <button className="btn sm dark">Guardar notificaciones</button>
        </form>
      )}

      {f === "notificaciones" && <div className="panel" style={{ margin: "14px 0" }}>
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
                <td>{a.sentTo} {a.sentTo === 1 ? "destino" : "destinos"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </AdminShell>
  );
}
