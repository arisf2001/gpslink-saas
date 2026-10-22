import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { getSession } from "@/lib/session";
import { countryEs, daysLeft, statusLabel } from "@/lib/sim/carriers";
import { AdminShell } from "../../admin-shell";
import { saveSimInfoAction } from "../actions";
import { SimCommand } from "../sim-ui";

export const dynamic = "force-dynamic";

const money = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2));
const when = (d: Date) => d.toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "short", timeStyle: "short" });

export default async function SimCardPage({ params, searchParams }: { params: Promise<{ iccid: string }>; searchParams: Promise<{ back?: string; ok?: string; error?: string; msg?: string }> }) {
  if (!(await getSession("admin"))) redirect("/admin");
  const { iccid } = await params;
  const sp = await searchParams;
  const card = await prisma.simCard.findUnique({ where: { iccid } });
  if (!card) notFound();
  const [carrier, events, agency] = await Promise.all([
    prisma.simCarrier.findUnique({ where: { code: card.carrierCode } }),
    prisma.simEvent.findMany({ where: { iccid }, orderBy: { id: "desc" }, take: 30 }),
    card.companyId ? prisma.company.findUnique({ where: { id: card.companyId }, select: { name: true } }) : null,
  ]);
  const back = sp.back?.startsWith("/admin/sim?") ? sp.back : "/admin/sim?f=todas";
  const self = `/admin/sim/${iccid}?back=${encodeURIComponent(back)}`;
  const d = daysLeft(card.expiresAt, new Date());
  const general = card.companyId ? [carrier?.agencyRenewCents ?? 0, carrier?.agencyReactivateCents ?? 0] : [carrier?.renewCents ?? 0, carrier?.reactivateCents ?? 0];
  const cur = carrier?.currency ?? "usd";
  return (
    <AdminShell>
      <p><Link href={back}>← Volver a Tarjetas SIM</Link></p>
      <h1 style={{ marginBottom: 4 }}>{card.nickname ?? "SIM"} <span className="hint" style={{ fontSize: 16 }}>{card.iccid}</span></h1>
      {sp.ok === "info" && <div className="ok" style={{ margin: "10px 0" }}>Ficha guardada.</div>}
      {sp.ok === "cmd" && <div className="ok" style={{ margin: "10px 0" }}>{sp.msg} El estado puede tardar unos minutos en cambiar.</div>}
      {sp.error === "cmd" && <div className="err" style={{ margin: "10px 0" }}>No se hizo el cambio: {sp.msg}</div>}
      {sp.error === "precio" && <div className="err" style={{ margin: "10px 0" }}>Precio no válido. Escribe solo el número, por ejemplo 12 o 12.50.</div>}

      <div className="panel" style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        <div><div className="hint">Estado</div><b>{statusLabel(card.status)}</b></div>
        <div><div className="hint">Vehículo · cliente</div>{card.deviceName ?? "Sin equipo"}<div className="hint">{agency ? `Agencia: ${agency.name}` : card.deviceId ? "Cliente directo" : ""}{card.ownerEmail ? ` · ${card.ownerEmail}` : ""}</div></div>
        <div><div className="hint">Plan · uso</div>{card.packageName ?? "Sin plan"}<div className="hint">{card.usedMb.toFixed(2)} de {card.totalMb} MB</div></div>
        <div><div className="hint">Vence</div>{formatDate(card.expiresAt)}<div className="hint">{d === null ? "Sin fecha" : d <= 0 ? "Vencida" : `Le quedan ${d} días`}</div></div>
        <div><div className="hint">País · teléfono</div>{countryEs(card.country) || "—"}<div className="hint">{card.msisdn ?? ""}{card.imei ? ` · IMEI ${card.imei}` : ""}</div></div>
        <div><div className="hint">Telebay</div>{card.tbCustomer ? `Cliente: ${card.tbCustomer}` : "Cuenta principal"}{card.panelOnly && <div className="hint">No llega por la API: no se actualiza sola</div>}<div><a href={`https://web.telebay.cn/#/?iccid=${card.iccid}&lang=es`} target="_blank" rel="noreferrer">Ver consumo en Telebay ↗</a></div></div>
        <div><div className="hint">Acción</div><SimCommand card={card} back={self} /></div>
      </div>

      <form action={saveSimInfoAction} className="panel" style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", marginTop: 14 }}>
        <input type="hidden" name="iccid" value={card.iccid} />
        <input type="hidden" name="back" value={back} />
        <h2 style={{ gridColumn: "1/-1", margin: 0, fontSize: 17, textAlign: "left" }}>Editar ficha</h2>
        <label style={{ fontSize: 13, display: "grid", gap: 4 }}>Apodo<input name="nickname" defaultValue={card.nickname ?? ""} maxLength={190} placeholder="Ej.: Depo OBD 3577" /></label>
        <label style={{ fontSize: 13, display: "grid", gap: 4 }}>Nombre del cliente<input name="customerName" defaultValue={card.customerName ?? ""} maxLength={190} placeholder="Para SIM vendidas sin rastreo" /></label>
        <label style={{ fontSize: 13, display: "grid", gap: 4 }}>Precio especial renovación / año<input name="renew" defaultValue={money(card.renewCents)} inputMode="decimal" placeholder={`General: ${formatMoney(general[0], cur)}`} /></label>
        <label style={{ fontSize: 13, display: "grid", gap: 4 }}>Precio especial reactivación<input name="reactivate" defaultValue={money(card.reactivateCents)} inputMode="decimal" placeholder={`General: ${formatMoney(general[1], cur)}`} /></label>
        <p className="hint" style={{ gridColumn: "1/-1", margin: 0 }}>Vacío = usa el precio de la pestaña Precios. Si pones un precio mayor que 0, a esta SIM le llega el aviso de pago 10 días antes del vencimiento.</p>
        <label style={{ fontSize: 13, display: "grid", gap: 4, gridColumn: "1/-1" }}>Notas<textarea name="notes" defaultValue={card.notes ?? ""} rows={3} maxLength={5000} /></label>
        <div><button className="btn sm dark">Guardar</button></div>
      </form>

      <div className="panel" style={{ marginTop: 14 }}>
        <h2 style={{ marginTop: 0, fontSize: 17, textAlign: "left" }}>Historial</h2>
        {events.length === 0 ? <p className="hint">Sin cambios registrados.</p> : (
          <table className="t"><tbody>{events.map((e) => <tr key={e.id}><td style={{ whiteSpace: "nowrap" }}>{when(e.createdAt)}</td><td>{e.detail}</td></tr>)}</tbody></table>
        )}
      </div>
    </AdminShell>
  );
}
