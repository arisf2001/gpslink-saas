import Link from "next/link";
import { redirect } from "next/navigation";
import type { SimCard } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { getSession } from "@/lib/session";
import { countryEs, daysLeft, ensureCarriers, SIM_STATUS, statusLabel } from "@/lib/sim/carriers";
import { dailyReportData, NOTICE_DAYS, REACTIVATION_NOTE } from "@/lib/sim/notify";
import { telebayConfigured } from "@/lib/sim/telebay";
import { AdminShell } from "../admin-shell";
import { linkSimAction, markDoneAction, saveCarrierAction, simCommandAction, saveSupplierAction, syncNowAction } from "./actions";

export const dynamic = "force-dynamic";

const TABS = [
  ["hoy", "Reporte de hoy"],
  ["todas", "Todas"],
  ["vencer", "Por vencer"],
  ["pagadas", "Pagadas por reactivar"],
  ["sin-equipo", "Sin equipo"],
  ["precios", "Precios"],
] as const;

const EXPIRY = [
  ["", "Cualquier vencimiento"],
  ["vencidas", "Vencidas"],
  ["10", `Vencen en ${NOTICE_DAYS} días o menos`],
  ["30", "Vencen en 30 días o menos"],
  ["90", "Vencen en 90 días o menos"],
  ["sin-fecha", "Sin fecha (plan sin empezar)"],
] as const;

type Filters = { q?: string; estado?: string; vence?: string; cia?: string; equipo?: string; tipo?: string; pais?: string; orden?: string; col?: string };

const SORT_COLS: Record<string, (c: SimCard) => string | number | null> = {
  iccid: (c) => c.iccid,
  estado: (c) => statusLabel(c.status),
  vehiculo: (c) => c.deviceName?.trim().toLowerCase() || null,
  plan: (c) => c.usedMb,
  vence: (c) => c.expiresAt?.getTime() ?? null,
  dias: (c) => c.expiresAt?.getTime() ?? null,
};

function sortCards(cards: SimCard[], col = "dias", orden?: string): SimCard[] {
  const key = SORT_COLS[col];
  if (!key || (orden !== "asc" && orden !== "desc")) return cards;
  const dir = orden === "asc" ? 1 : -1;
  return [...cards].sort((a, b) => {
    const x = key(a), y = key(b);
    if (x === null || y === null) return (x === null ? 1 : 0) - (y === null ? 1 : 0);
    if (col === "plan" && a.packageName !== b.packageName) return dir * (a.packageName ?? "").localeCompare(b.packageName ?? "");
    return dir * (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es", { numeric: true }));
  });
}

function applyFilters(cards: SimCard[], fl: Filters, now: Date): SimCard[] {
  const q = fl.q?.trim().toLowerCase();
  return cards.filter((c) => {
    if (q && ![c.iccid, c.msisdn, c.imei, c.deviceName, c.ownerEmail, c.ownerPhone].some((v) => v?.toLowerCase().includes(q))) return false;
    if (fl.estado && String(c.status) !== fl.estado) return false;
    if (fl.cia && c.carrierCode !== fl.cia) return false;
    if (fl.pais && countryEs(c.country) !== fl.pais) return false;
    if (fl.equipo === "con" && !c.deviceId) return false;
    if (fl.equipo === "sin" && c.deviceId) return false;
    if (fl.tipo === "directo" && (!c.deviceId || c.companyId)) return false;
    if (fl.tipo === "agencia" && !c.companyId) return false;
    const d = daysLeft(c.expiresAt, now);
    if (fl.vence === "vencidas" && !(d !== null && d <= 0)) return false;
    if (fl.vence === "sin-fecha" && d !== null) return false;
    if (["10", "30", "90"].includes(fl.vence ?? "") && !(d !== null && d > 0 && d <= Number(fl.vence))) return false;
    return true;
  });
}

const when = (d: Date) => d.toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "short", timeStyle: "short" });

function Days({ card, now }: { card: SimCard; now: Date }) {
  const d = daysLeft(card.expiresAt, now);
  if (d === null) return <span className="hint">Sin fecha</span>;
  const color = d <= 0 ? "#dc2626" : d <= NOTICE_DAYS ? "#d97706" : "#16a34a";
  return <span style={{ color, fontWeight: 700, whiteSpace: "nowrap" }}>{d <= 0 ? "Vencida" : `${d} ${d === 1 ? "día" : "días"}`}</span>;
}

const COMMANDS: Record<number, { op: string; label: string; note: string; danger?: boolean }> = {
  1: { op: "activate", label: "Activar plan", note: "Su plan de 12 meses empieza a contar desde hoy, aunque el equipo no esté instalado." },
  2: { op: "suspend", label: "Suspender", note: "El equipo se queda sin internet hasta que la reactives.", danger: true },
  3: { op: "resume", label: "Reactivar", note: "El equipo vuelve a tener internet." },
};

function SimCommand({ card, back }: { card: SimCard; back: string }) {
  const c = COMMANDS[card.status];
  if (!c) return null;
  return (
    <details>
      <summary className={`btn sm ${c.danger ? "red" : "s"}`} style={{ listStyle: "none", whiteSpace: "nowrap" }}>{c.label}</summary>
      <form action={simCommandAction} style={{ display: "grid", gap: 6, width: 230, marginTop: 8 }}>
        <input type="hidden" name="iccid" value={card.iccid} />
        <input type="hidden" name="op" value={c.op} />
        <input type="hidden" name="back" value={back} />
        <b>{c.label} la SIM {card.iccid}</b>
        <span className="hint">{card.deviceName ?? "Sin equipo"} · {c.note}</span>
        <label className="hint">Para confirmar, escribe los últimos 4 números del ICCID
          <input name="confirm" inputMode="numeric" maxLength={4} pattern="\d{4}" required autoComplete="off" />
        </label>
        <button className={`btn sm ${c.danger ? "red" : "dark"}`}>Confirmar</button>
      </form>
    </details>
  );
}

function SimTable({ cards, now, agencies, sort, back }: { cards: SimCard[]; now: Date; agencies: Map<string, string>; back: string; sort?: { col?: string; orden?: string; href: (col: string, orden: string) => string } }) {
  const head = (col: string, label: string) => {
    if (!sort) return label;
    const on = sort.orden && (sort.col || "dias") === col ? sort.orden : null;
    return (
      <Link href={sort.href(col, on === "asc" ? "desc" : "asc")} title={`Ordenar por ${label.toLowerCase()}`} style={{ whiteSpace: "nowrap" }}>
        {label} {on === "asc" ? "▲" : on === "desc" ? "▼" : <span style={{ opacity: 0.4 }}>▲▼</span>}
      </Link>
    );
  };
  return (
    <table className="t">
      <thead><tr><th>{head("iccid", "ICCID")}</th><th>{head("estado", "Estado")}</th><th>{head("vehiculo", "Vehículo · cliente")}</th><th>{head("plan", "Plan · uso")}</th><th>{head("vence", "Vence")}</th><th>{head("dias", "Le quedan")}</th><th>Acción</th></tr></thead>
      <tbody>
        {cards.length === 0 && <tr><td colSpan={7} className="hint">No hay SIM en esta lista.</td></tr>}
        {cards.map((c) => (
          <tr key={c.iccid}>
            <td><a href={`https://web.telebay.cn/#/?iccid=${c.iccid}&lang=es`} target="_blank" rel="noreferrer">{c.iccid}</a><div className="hint">{countryEs(c.country)}</div></td>
            <td>{statusLabel(c.status)}</td>
            <td>{c.deviceName ?? <span className="hint">Sin equipo</span>}<div className="hint">{c.companyId ? `Agencia: ${agencies.get(c.companyId) ?? ""}` : c.deviceId ? "Cliente directo" : ""}{c.ownerEmail ? ` · ${c.ownerEmail}` : ""}</div></td>
            <td>{c.packageName ?? "—"}<div className="hint">{c.usedMb.toFixed(2)} de {c.totalMb} MB</div></td>
            <td>{c.expiresAt ? formatDate(c.expiresAt) : "—"}</td>
            <td><Days card={c} now={now} /></td>
            <td><SimCommand card={c} back={back} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function SimPage({ searchParams }: { searchParams: Promise<{ f?: string; ok?: string; error?: string; msg?: string } & Filters> }) {
  if (!(await getSession("admin"))) redirect("/admin");
  const sp = await searchParams;
  const { f = "hoy", ok, error, q = "" } = sp;
  const now = new Date();
  const carriers = await ensureCarriers();
  const all = await prisma.simCard.findMany({ where: { goneAt: null }, orderBy: [{ expiresAt: "asc" }, { iccid: "asc" }] });
  const report = await dailyReportData(now);
  const pending = await prisma.simRenewal.findMany({ where: { status: "PAID" }, orderBy: { paidAt: "asc" } });
  const agencies = new Map((await prisma.company.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const lastSync = all.reduce<Date | null>((m, c) => (!m || c.lastSyncAt > m ? c.lastSyncAt : m), null);
  const filtered = sortCards(applyFilters(all, sp, now), sp.col, sp.orden);
  const sortHref = (col: string, orden: string) => {
    const u = new URLSearchParams({ f });
    for (const k of ["q", "estado", "vence", "cia", "pais", "equipo", "tipo"] as const) if (sp[k]?.trim()) u.set(k, sp[k]!);
    u.set("col", col);
    u.set("orden", orden);
    return `/admin/sim?${u}`;
  };
  const back = `/admin/sim?${new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1] && !["ok", "error", "msg"].includes(e[0])))}`;
  const countries = [...new Set(all.map((c) => countryEs(c.country)).filter(Boolean))].sort();
  const filtering = [sp.q, sp.estado, sp.vence, sp.cia, sp.equipo, sp.tipo, sp.pais].some((v) => v?.trim());
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
      {error === "cmd" && <div className="err" style={{ margin: "10px 0" }}>No se hizo el cambio: {sp.msg}</div>}
      {ok && <div className="ok" style={{ margin: "10px 0" }}>{ok === "cmd" ? `${sp.msg ?? ""} El estado puede tardar unos minutos en cambiar.` : ok === "sync" ? "SIM actualizadas." : ok === "link" ? "SIM unida al equipo." : ok === "done" ? "Marcada como reactivada; le avisamos al cliente." : ok === "suplidor" ? "Contacto del suplidor guardado." : "Precios guardados."}</div>}

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
          {f === "todas" && (
            <form className="row" style={{ marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <input type="hidden" name="f" value="todas" />
              {sp.orden && <input type="hidden" name="orden" value={sp.orden} />}
              {sp.col && <input type="hidden" name="col" value={sp.col} />}
              <input name="q" defaultValue={q} placeholder="Buscar ICCID, IMEI, vehículo, correo o teléfono" style={{ maxWidth: 320 }} />
              <select name="estado" defaultValue={sp.estado ?? ""} aria-label="Estado">
                <option value="">Cualquier estado</option>
                {Object.entries(SIM_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select name="vence" defaultValue={sp.vence ?? ""} aria-label="Vencimiento">
                {EXPIRY.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select name="cia" defaultValue={sp.cia ?? ""} aria-label="Compañía">
                <option value="">Todas las compañías</option>
                {carriers.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
              <select name="pais" defaultValue={sp.pais ?? ""} aria-label="País">
                <option value="">Todos los países</option>
                {countries.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select name="equipo" defaultValue={sp.equipo ?? ""} aria-label="Equipo">
                <option value="">Con o sin equipo</option>
                <option value="con">Con equipo</option>
                <option value="sin">Sin equipo</option>
              </select>
              <select name="tipo" defaultValue={sp.tipo ?? ""} aria-label="Cliente">
                <option value="">Directos y agencias</option>
                <option value="directo">Cliente directo</option>
                <option value="agencia">Agencia</option>
              </select>
              <button className="btn sm">Buscar</button>
              {filtering && <Link href="/admin/sim?f=todas" className="btn sm s">Quitar filtros</Link>}
            </form>
          )}
          {f === "todas" && <p className="hint" style={{ marginBottom: 8 }}>Mostrando {filtered.length} de {all.length} SIM.</p>}
          <SimTable cards={f === "vencer" ? sortCards([...report.expired, ...report.soon], sp.col, sp.orden) : filtered} now={now} agencies={agencies} back={back} sort={{ col: sp.col, orden: sp.orden, href: sortHref }} />
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
          <SimTable cards={sortCards(report.noDevice, sp.col, sp.orden)} now={now} agencies={agencies} back={back} sort={{ col: sp.col, orden: sp.orden, href: sortHref }} />
        </div>
      )}

      {f === "precios" && (
        <div className="panel">
          <p className="hint" style={{ marginBottom: 10 }}>Precios por año. <b>Público:</b> tus clientes directos de track.gpslinkusa.com. <b>Agencia:</b> lo que paga la marca blanca por las SIM de sus equipos. La reactivación se suma cuando la SIM ya venció o está suspendida. La compañía se reconoce por el comienzo del ICCID.</p>
          <table className="t">
            <thead><tr><th>Compañía</th><th>Precios en USD</th></tr></thead>
            <tbody>
              {carriers.map((c) => (
                <tr key={c.code}>
                  <td><b>{c.name}</b><div className="hint">{all.filter((s) => s.carrierCode === c.code).length} SIM</div></td>
                  <td>
                    <form action={saveCarrierAction} className="row" style={{ alignItems: "flex-end" }}>
                      <input type="hidden" name="code" value={c.code} />
                      <label style={{ fontSize: 13 }}>Comienzo del ICCID<input name="prefixes" defaultValue={c.iccidPrefixes} style={{ width: 120 }} /></label>
                      <label style={{ fontSize: 13 }}>Público: renovación/año<input name="renew" defaultValue={(c.renewCents / 100).toString()} inputMode="decimal" style={{ width: 120 }} /></label>
                      <label style={{ fontSize: 13 }}>Público: reactivación<input name="reactivate" defaultValue={(c.reactivateCents / 100).toString()} inputMode="decimal" style={{ width: 120 }} /></label>
                      <label style={{ fontSize: 13 }}>Agencia: renovación/año<input name="agencyRenew" defaultValue={(c.agencyRenewCents / 100).toString()} inputMode="decimal" style={{ width: 120 }} /></label>
                      <label style={{ fontSize: 13 }}>Agencia: reactivación<input name="agencyReactivate" defaultValue={(c.agencyReactivateCents / 100).toString()} inputMode="decimal" style={{ width: 120 }} /></label>
                      <button className="btn sm">{ok === "precios" ? "Guardado ✓" : "Guardar"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint" style={{ marginTop: 8 }}>Si el precio de renovación está en 0, no se envían avisos de pago (ni al público ni a las agencias).</p>
        </div>
      )}
      <div className="panel" id="suplidor" style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 17, marginBottom: 6, textAlign: "left" }}>Contacto del suplidor</h2>
        <p className="hint" style={{ marginBottom: 10 }}>Solo lo ves tú. Llénalo con los datos de cada compañía de SIM.</p>
        {carriers.map((c) => (
          <form key={c.code} action={saveSupplierAction} style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", marginBottom: 12 }}>
            <input type="hidden" name="code" value={c.code} />
            <input type="hidden" name="f" value={f} />
            <b style={{ gridColumn: "1/-1" }}>{c.name}</b>
            <label style={{ fontSize: 13, display: "grid", gap: 4 }}>Contacto<input name="supplierContact" defaultValue={c.supplierContact ?? ""} /></label>
            <label style={{ fontSize: 13, display: "grid", gap: 4 }}>Correo<input name="supplierEmail" type="email" defaultValue={c.supplierEmail ?? ""} /></label>
            <label style={{ fontSize: 13, display: "grid", gap: 4 }}>Teléfono / WhatsApp<input name="supplierPhone" defaultValue={c.supplierPhone ?? ""} /></label>
            <label style={{ fontSize: 13, display: "grid", gap: 4 }}>Página web<input name="supplierWeb" defaultValue={c.supplierWeb ?? ""} /></label>
            <label style={{ fontSize: 13, display: "grid", gap: 4, gridColumn: "1/-1" }}>Notas<textarea name="supplierNotes" rows={3} defaultValue={c.supplierNotes ?? ""} /></label>
            <div style={{ gridColumn: "1/-1" }}><button className="btn sm">Guardar contacto</button></div>
          </form>
        ))}
      </div>
    </AdminShell>
  );
}
