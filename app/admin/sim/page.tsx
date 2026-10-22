import Link from "next/link";
import { redirect } from "next/navigation";
import type { SimCard } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { getSession } from "@/lib/session";
import { daysLeft, ensureCarriers, statusLabel } from "@/lib/sim/carriers";
import { dailyReportData, NOTICE_DAYS, REACTIVATION_NOTE } from "@/lib/sim/notify";
import { telebayConfigured } from "@/lib/sim/telebay";
import { AdminShell } from "../admin-shell";
import { linkSimAction, markDoneAction, saveCarrierAction, syncNowAction } from "./actions";

export const dynamic = "force-dynamic";

const TABS = [
  ["hoy", "Reporte de hoy"],
  ["todas", "Todas"],
  ["vencer", "Por vencer"],
  ["pagadas", "Pagadas por reactivar"],
  ["sin-equipo", "Sin equipo"],
  ["precios", "Precios"],
] as const;

const when = (d: Date) => d.toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "short", timeStyle: "short" });

function Days({ card, now }: { card: SimCard; now: Date }) {
  const d = daysLeft(card.expiresAt, now);
  if (d === null) return <span className="hint">Sin fecha</span>;
  const color = d <= 0 ? "#dc2626" : d <= NOTICE_DAYS ? "#d97706" : "#16a34a";
  return <span style={{ color, fontWeight: 700, whiteSpace: "nowrap" }}>{d <= 0 ? "Vencida" : `${d} ${d === 1 ? "día" : "días"}`}</span>;
}

function SimTable({ cards, now }: { cards: SimCard[]; now: Date }) {
  return (
    <table className="t">
      <thead><tr><th>ICCID</th><th>Estado</th><th>Vehículo · cliente</th><th>Plan · uso</th><th>Vence</th><th>Le quedan</th></tr></thead>
      <tbody>
        {cards.length === 0 && <tr><td colSpan={6} className="hint">No hay SIM en esta lista.</td></tr>}
        {cards.map((c) => (
          <tr key={c.iccid}>
            <td><a href={`https://web.telebay.cn/#/?iccid=${c.iccid}&lang=es`} target="_blank" rel="noreferrer">{c.iccid}</a><div className="hint">{c.country ?? ""}</div></td>
            <td>{statusLabel(c.status)}</td>
            <td>{c.deviceName ?? <span className="hint">Sin equipo</span>}<div className="hint">{c.ownerEmail ?? ""}</div></td>
            <td>{c.packageName ?? "—"}<div className="hint">{c.usedMb.toFixed(2)} de {c.totalMb} MB</div></td>
            <td>{c.expiresAt ? formatDate(c.expiresAt) : "—"}</td>
            <td><Days card={c} now={now} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function SimPage({ searchParams }: { searchParams: Promise<{ f?: string; ok?: string; error?: string; q?: string }> }) {
  if (!(await getSession("admin"))) redirect("/admin");
  const { f = "hoy", ok, error, q = "" } = await searchParams;
  const now = new Date();
  const carriers = await ensureCarriers();
  const all = await prisma.simCard.findMany({ where: { goneAt: null }, orderBy: [{ expiresAt: "asc" }, { iccid: "asc" }] });
  const report = await dailyReportData(now);
  const pending = await prisma.simRenewal.findMany({ where: { status: "PAID" }, orderBy: { paidAt: "asc" } });
  const lastSync = all.reduce<Date | null>((m, c) => (!m || c.lastSyncAt > m ? c.lastSyncAt : m), null);
  const search = q.trim();
  const filtered = search ? all.filter((c) => [c.iccid, c.msisdn, c.deviceName, c.ownerEmail].some((v) => v?.toLowerCase().includes(search.toLowerCase()))) : all;
  const counts = { active: all.filter((c) => c.status === 2).length, linked: all.filter((c) => c.deviceId).length };

  return (
    <AdminShell>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 className="page-title">Tarjetas SIM</h1>
        <form action={syncNowAction}><button className="btn sm s">Actualizar ahora</button></form>
      </div>
      <p className="hint">{all.length} SIM · {counts.active} activas · {counts.linked} unidas a un equipo · última actualización {lastSync ? when(lastSync) : "nunca"}. Se actualiza sola cada hora y el reporte te llega por correo cada mañana.</p>
      {!telebayConfigured() && <div className="err" style={{ margin: "10px 0" }}>Falta la llave de Telebay en el servidor.</div>}
      {error === "sync" && <div className="err" style={{ margin: "10px 0" }}>No pudimos leer las SIM del proveedor. Inténtalo en unos minutos.</div>}
      {error === "link" && <div className="err" style={{ margin: "10px 0" }}>Revisa el ICCID y el número del equipo (ID de GPS Link).</div>}
      {error === "precio" && <div className="err" style={{ margin: "10px 0" }}>Precio o prefijo no válido.</div>}
      {ok && <div className="ok" style={{ margin: "10px 0" }}>{ok === "sync" ? "SIM actualizadas." : ok === "link" ? "SIM unida al equipo." : ok === "done" ? "Marcada como reactivada; le avisamos al cliente." : "Precios guardados."}</div>}

      <div className="tabs" style={{ margin: "14px 0 10px" }}>
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/admin/sim?f=${k}`} className={`tab${f === k ? " on" : ""}`}>
            {label}{k === "vencer" ? ` (${report.soon.length + report.expired.length})` : k === "pagadas" ? ` (${pending.length})` : k === "sin-equipo" ? ` (${report.noDevice.length})` : ""}
          </Link>
        ))}
      </div>

      {f === "hoy" && (
        <div className="grid2" style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
          <div className="panel"><h2 style={{ fontSize: 17 }}>Activaciones nuevas (24 h): {report.activations.length}</h2>
            {report.activations.length === 0 ? <p className="hint">Ninguna.</p> : report.activations.map((e) => <p key={e.id} style={{ fontSize: 14 }}>{e.iccid} · {e.detail} · {when(e.createdAt)}</p>)}
            <p className="hint">SIM nuevas en la cuenta: {report.newCards.length}</p></div>
          <div className="panel"><h2 style={{ fontSize: 17 }}>Cambios (24 h): {report.changes.length}</h2>
            {report.changes.length === 0 ? <p className="hint">Ninguno.</p> : report.changes.slice(0, 30).map((e) => <p key={e.id} style={{ fontSize: 14 }}>{e.iccid} · {e.detail}</p>)}</div>
          <div className="panel"><h2 style={{ fontSize: 17 }}>Pendientes</h2>
            <p>Pagadas por reactivar: <b>{pending.length}</b></p>
            <p>Listas para activar: <b>{report.toActivate.length}</b></p>
            <p>Sin equipo asignado: <b>{report.noDevice.length}</b></p>
            <p>Vencen en {NOTICE_DAYS} días o menos: <b>{report.soon.length}</b> · Vencidas: <b>{report.expired.length}</b></p></div>
        </div>
      )}

      {(f === "todas" || f === "vencer") && (
        <div className="panel">
          {f === "todas" && <form className="row" style={{ marginBottom: 10 }}><input type="hidden" name="f" value="todas" /><input name="q" defaultValue={q} placeholder="Buscar ICCID, número, vehículo o correo" style={{ maxWidth: 360 }} /><button className="btn sm">Buscar</button></form>}
          <SimTable cards={f === "vencer" ? [...report.expired, ...report.soon] : filtered} now={now} />
        </div>
      )}

      {f === "pagadas" && (
        <div className="panel">
          <p className="hint" style={{ marginBottom: 10 }}>El cliente ya pagó. Renueva el plan en el panel del proveedor y márcala como reactivada; al cliente le llega el aviso. {REACTIVATION_NOTE}</p>
          <table className="t">
            <thead><tr><th>ICCID</th><th>Vehículo</th><th>Monto</th><th>Pagó</th><th></th></tr></thead>
            <tbody>
              {pending.length === 0 && <tr><td colSpan={5} className="hint">No hay SIM pagadas pendientes.</td></tr>}
              {pending.map((p) => (
                <tr key={p.id}>
                  <td>{p.iccid}</td>
                  <td>{all.find((c) => c.iccid === p.iccid)?.deviceName ?? "—"}</td>
                  <td>{formatMoney(p.amountCents, p.currency)}{p.reactivation ? " (con reactivación)" : ""}</td>
                  <td>{p.paidAt ? when(p.paidAt) : ""}</td>
                  <td><form action={markDoneAction}><input type="hidden" name="id" value={p.id} /><button className="btn sm dark">Marcar reactivada</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {f === "sin-equipo" && (
        <div className="panel">
          <h2 style={{ fontSize: 17, marginBottom: 6 }}>Unir una SIM a su equipo</h2>
          <p className="hint" style={{ marginBottom: 10 }}>Se unen solas cuando el ICCID está en &quot;Número SIM&quot; del equipo en GPS Link. Si no, ponlo aquí con el ID del equipo.</p>
          <form action={linkSimAction} className="row" style={{ marginBottom: 14 }}>
            <input name="iccid" placeholder="ICCID" style={{ width: 230 }} />
            <input name="deviceId" placeholder="ID del equipo" inputMode="numeric" style={{ width: 130 }} />
            <button className="btn sm">Unir</button>
          </form>
          <SimTable cards={report.noDevice} now={now} />
        </div>
      )}

      {f === "precios" && (
        <div className="panel">
          <p className="hint" style={{ marginBottom: 10 }}>Precios por año para el cliente. La reactivación se suma cuando la SIM ya venció o está suspendida. La compañía se reconoce por el comienzo del ICCID.</p>
          <table className="t">
            <thead><tr><th>Compañía</th><th>Comienzo del ICCID · renovación al año · reactivación (USD)</th></tr></thead>
            <tbody>
              {carriers.map((c) => (
                <tr key={c.code}>
                  <td><b>{c.name}</b><div className="hint">{all.filter((s) => s.carrierCode === c.code).length} SIM</div></td>
                  <td>
                    <form action={saveCarrierAction} className="row">
                      <input type="hidden" name="code" value={c.code} />
                      <input name="prefixes" defaultValue={c.iccidPrefixes} aria-label="Comienzo del ICCID" style={{ width: 130 }} />
                      <input name="renew" defaultValue={(c.renewCents / 100).toString()} inputMode="decimal" aria-label="Renovación al año" style={{ width: 100 }} />
                      <input name="reactivate" defaultValue={(c.reactivateCents / 100).toString()} inputMode="decimal" aria-label="Reactivación" style={{ width: 100 }} />
                      <button className="btn sm">Guardar</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint" style={{ marginTop: 8 }}>Si el precio de renovación está en 0, no se envían avisos de pago para esa compañía.</p>
        </div>
      )}
    </AdminShell>
  );
}
