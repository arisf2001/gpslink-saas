import { redirect } from "next/navigation";
import { activationSetting, instructionLines, MODELS, offerItems, offerTotal, STABLE_HOURS, STATUS_LABEL, type ModelKey } from "@/lib/activation";
import { appUrl } from "@/lib/config";
import { prisma } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { getSession } from "@/lib/session";
import { AdminShell } from "../admin-shell";
import { saveOfferAction, toggleBrandAction } from "./actions";

export const dynamic = "force-dynamic";

const money = (c: number) => (c ? (c / 100).toFixed(2) : "");
const when = (d: Date | null) => (d ? d.toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short" }) : "—");

export default async function ActivacionPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  if (!(await getSession("admin"))) redirect("/admin");
  const { ok, error } = await searchParams;
  const s = await activationSetting();
  const [companies, acts] = await Promise.all([
    prisma.company.findMany({ where: { gpswoxUserId: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true, subdomain: true, activationEnabled: true } }),
    prisma.deviceActivation.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  const total = offerTotal(s);
  return (
    <AdminShell>
      <h1 className="page-title">Activación de equipos</h1>
      <p className="hint">
        El cliente pulsa «Activa tu dispositivo ahora», escoge GT06 o SinoTrack, pone el IMEI y su tarjeta. Le llegan las instrucciones por correo. Cuando el equipo lleva {STABLE_HOURS} horas conectado se cobra por 12 meses y el equipo le aparece en su cuenta. Se renueva solo cada año.
      </p>
      {error === "precio" && <div className="err" style={{ margin: "10px 0" }}>Precio no válido.</div>}
      {error === "nada" && <div className="err" style={{ margin: "10px 0" }}>Escoge al menos una cosa para cobrar (plataforma o SIM).</div>}
      {ok && <div className="ok" style={{ margin: "10px 0" }}>{ok === "marca" ? "Marca blanca actualizada." : "Oferta guardada."}</div>}

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", marginTop: 12 }}>
        <form action={saveOfferAction} className="panel" style={{ display: "grid", gap: 10 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>Oferta (por equipo, 12 meses)</h2>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="trackEnabled" defaultChecked={s.trackEnabled} style={{ width: "auto" }} /> Activo para mis clientes de track.gpslinkusa.com</label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="chargePlatform" defaultChecked={s.chargePlatform} style={{ width: "auto" }} /> Cobrar plataforma</label>
          <label style={{ fontSize: 13, display: "grid", gap: 4 }}>Precio plataforma / año (USD)<input name="platform" defaultValue={money(s.platformCents)} inputMode="decimal" placeholder="0.00" /></label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="chargeSim" defaultChecked={s.chargeSim} style={{ width: "auto" }} /> Cobrar SIM</label>
          <label style={{ fontSize: 13, display: "grid", gap: 4 }}>Precio SIM / año (USD)<input name="sim" defaultValue={money(s.simCents)} inputMode="decimal" placeholder="0.00" /></label>
          <p className="hint" style={{ margin: 0 }}>
            Hoy el cliente paga <b>{formatMoney(total, s.currency)}</b> por equipo al año{offerItems(s).length ? ` (${offerItems(s).map((i) => `${i.label} ${formatMoney(i.cents, s.currency)}`).join(" + ")})` : ""}. Ejemplo: marca solo «Cobrar SIM» y la plataforma queda gratis. Con total $0 el equipo se activa sin cobro, pero igual se pide la tarjeta.
          </p>
          <div><button className="btn sm dark">Guardar oferta</button></div>
        </form>

        <div className="panel">
          <h2 style={{ fontSize: 17, margin: 0 }}>Marcas blancas</h2>
          <p className="hint">Tú escoges a cuáles se les activa. Sus clientes ven el botón y pagan con la misma oferta.</p>
          {companies.length === 0 && <p className="hint">No hay marcas blancas con cuenta en GPS Link.</p>}
          {companies.map((c) => (
            <form key={c.id} action={toggleBrandAction} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: "1px solid #eee" }}>
              <input type="hidden" name="companyId" value={c.id} />
              <input type="hidden" name="on" value={c.activationEnabled ? "0" : "1"} />
              <span>{c.name}{c.subdomain ? <span className="hint"> · {c.subdomain}</span> : null} — <b>{c.activationEnabled ? "Activa" : "Apagada"}</b></span>
              <button className={`btn sm${c.activationEnabled ? "" : " dark"}`}>{c.activationEnabled ? "Apagar" : "Activar"}</button>
            </form>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", marginTop: 14 }}>
        {(Object.keys(MODELS) as ModelKey[]).map((m) => (
          <div key={m} className="panel">
            <h2 style={{ fontSize: 17, margin: 0 }}>Correo {MODELS[m].label}</h2>
            {instructionLines(m).map((l) => <p key={l} style={{ fontSize: 14, margin: "6px 0" }}>{l}</p>)}
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 18, margin: "18px 0 8px" }}>Activaciones ({acts.length})</h2>
      <p className="hint">Enlace del botón para los clientes: {appUrl()}/activar</p>
      <table className="t">
        <thead><tr><th>Fecha</th><th>Cliente</th><th>Equipo</th><th>Modelo</th><th>Estado</th><th>Primera señal</th><th>Monto</th><th>Vence</th></tr></thead>
        <tbody>
          {acts.length === 0 && <tr><td colSpan={8} className="hint">Todavía no hay activaciones.</td></tr>}
          {acts.map((a) => (
            <tr key={a.id}>
              <td>{when(a.createdAt)}</td>
              <td>{a.email}</td>
              <td>{a.name}<div className="hint">IMEI {a.imei}{a.deviceId ? ` · ID ${a.deviceId}` : ""}</div></td>
              <td>{MODELS[a.model as ModelKey]?.label ?? a.model}</td>
              <td>{STATUS_LABEL[a.status] ?? a.status}{a.simIccid && <div className="hint">SIM tuya: <a href={`/admin/sim/${a.simIccid}`}>{a.simIccid}</a></div>}{a.error && <div className="err" style={{ fontSize: 12 }}>{a.error}</div>}</td>
              <td>{when(a.firstSignalAt)}</td>
              <td>{formatMoney(a.amountCents, s.currency)}<div className="hint">{a.items}</div></td>
              <td>{a.expiresAt ? formatDate(a.expiresAt) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminShell>
  );
}
