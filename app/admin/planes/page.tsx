import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { activationSetting, offerItems, offerTotal } from "@/lib/activation";
import { formatMoney } from "@/lib/format";
import { ensureDefaultPlans } from "@/lib/plans";
import { ensureCarriers } from "@/lib/sim/carriers";
import { getSession } from "@/lib/session";
import { savePlanAction, saveTiersAction } from "../actions";
import { saveActivationPricesAction } from "../activacion/actions";
import { AdminShell } from "../admin-shell";
import { saveCarrierAction } from "../sim/actions";

export const dynamic = "force-dynamic";

export default async function PlanesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  if (!(await getSession("admin"))) redirect("/admin");
  const { ok, error } = await searchParams;
  await ensureDefaultPlans();
  const plans = await prisma.plan.findMany({ orderBy: [{ sortOrder: "asc" }, { devices: "asc" }] });
  const tiers = await prisma.priceTier.findMany({ orderBy: { minDevices: "asc" } });
  const [act, carriers, simCounts] = await Promise.all([
    activationSetting(),
    ensureCarriers(),
    prisma.simCard.groupBy({ by: ["carrierCode"], where: { goneAt: null }, _count: true }),
  ]);
  const money = (c: number) => (c ? (c / 100).toFixed(2) : "");
  const ERRORS: Record<string, string> = {
    activacion: "Precio de activación no válido. Usa solo números, por ejemplo 10 o 9.50.",
    nada: "En activación escoge al menos una cosa para cobrar (plataforma o SIM).",
    sim: "Precio de SIM no válido, o falta el comienzo del ICCID.",
  };

  return (
    <AdminShell>
      <h1 className="page-title">Precios</h1>
      <p className="hint" style={{ marginBottom: 12 }}>Todos los precios en un solo lugar: <a href="#marcas">marcas blancas</a>, <a href="#activacion">activación por equipo</a> y <a href="#sim">tarjetas SIM</a>.</p>
      {error && <div className="err" style={{ marginBottom: 10 }}>{ERRORS[error] ?? "Precio no válido. Usa solo números, por ejemplo 6 o 5.50."}</div>}
      {ok === "activacion" && <div className="ok" style={{ marginBottom: 10 }}>Precios de activación guardados.</div>}
      {ok === "sim" && <div className="ok" style={{ marginBottom: 10 }}>Precios de SIM guardados.</div>}
      <div className="panel" id="marcas" style={{ marginBottom: 18, padding: 18 }}>
        <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 6 }}>1. Marcas blancas: precio por equipo al año (USD)</h2>
        <p className="hint" style={{ marginBottom: 12 }}>El precio se escoge según cuántos equipos activos tiene la empresa el día de la factura. Si está en 0, la página muestra &quot;Consultar&quot;.</p>
        <form action={saveTiersAction} className="row" style={{ alignItems: "flex-end" }}>
          {tiers.map((t, i) => (
            <label key={t.id} style={{ fontSize: 13 }}>{t.minDevices}{tiers[i + 1] ? ` a ${tiers[i + 1].minDevices - 1}` : " o más"} equipos
              <input name={`price-${t.id}`} defaultValue={(t.priceCents / 100).toString()} inputMode="decimal" style={{ width: 110 }} />
            </label>
          ))}
          <button className="btn sm">{ok === "tramos" ? "Guardado ✓" : "Guardar precios"}</button>
        </form>
      </div>
      <div className="panel" id="activacion" style={{ marginBottom: 18, padding: 18 }}>
        <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 6 }}>2. Activación por equipo (12 meses, USD)</h2>
        <p className="hint" style={{ marginBottom: 12 }}>Lo que paga el cliente al pulsar «Activa tu dispositivo ahora», cuando su equipo lleva 5 horas conectado. Ejemplo: marca solo «Cobrar SIM» y la plataforma queda gratis. A quién se le activa se escoge en <a href="/admin/activacion">Activación</a>.</p>
        <form action={saveActivationPricesAction} className="row" style={{ alignItems: "flex-end" }}>
          <label className="row" style={{ fontSize: 13 }}><input type="checkbox" name="chargePlatform" defaultChecked={act.chargePlatform} style={{ width: "auto" }} /> Cobrar plataforma</label>
          <label style={{ fontSize: 13 }}>Plataforma / año<input name="platform" defaultValue={money(act.platformCents)} inputMode="decimal" placeholder="0.00" style={{ width: 110 }} /></label>
          <label className="row" style={{ fontSize: 13 }}><input type="checkbox" name="chargeSim" defaultChecked={act.chargeSim} style={{ width: "auto" }} /> Cobrar SIM</label>
          <label style={{ fontSize: 13 }}>SIM / año<input name="sim" defaultValue={money(act.simCents)} inputMode="decimal" placeholder="0.00" style={{ width: 110 }} /></label>
          <button className="btn sm">{ok === "activacion" ? "Guardado ✓" : "Guardar precios"}</button>
        </form>
        <p className="hint" style={{ marginTop: 8 }}>Hoy el cliente paga <b>{formatMoney(offerTotal(act), act.currency)}</b> por equipo al año{offerItems(act).length ? ` (${offerItems(act).map((i) => `${i.label} ${formatMoney(i.cents, act.currency)}`).join(" + ")})` : ""}. Con total $0 el equipo se activa sin cobro, pero igual se pide la tarjeta.</p>
      </div>
      <div className="panel" id="sim" style={{ marginBottom: 18, padding: 18 }}>
        <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 6 }}>3. Tarjetas SIM por compañía (USD)</h2>
        <p className="hint" style={{ marginBottom: 12 }}><b>Público:</b> tus clientes directos de track.gpslinkusa.com. <b>Agencia:</b> lo que paga la marca blanca por las SIM de sus equipos. La reactivación se suma cuando la SIM ya venció o está suspendida. Si la renovación está en 0, no se envían avisos de pago.</p>
        <table className="t">
          <thead><tr><th>Compañía</th><th>Precios</th></tr></thead>
          <tbody>
            {carriers.map((c) => (
              <tr key={c.code}>
                <td><b>{c.name}</b><div className="hint">{simCounts.find((x) => x.carrierCode === c.code)?._count ?? 0} SIM</div></td>
                <td>
                  <form action={saveCarrierAction} className="row" style={{ alignItems: "flex-end" }}>
                    <input type="hidden" name="code" value={c.code} />
                    <label style={{ fontSize: 13 }}>Comienzo del ICCID<input name="prefixes" defaultValue={c.iccidPrefixes} style={{ width: 120 }} /></label>
                    <label style={{ fontSize: 13 }}>Público: renovación/año<input name="renew" defaultValue={(c.renewCents / 100).toString()} inputMode="decimal" style={{ width: 120 }} /></label>
                    <label style={{ fontSize: 13 }}>Público: reactivación<input name="reactivate" defaultValue={(c.reactivateCents / 100).toString()} inputMode="decimal" style={{ width: 120 }} /></label>
                    <label style={{ fontSize: 13 }}>Agencia: renovación/año<input name="agencyRenew" defaultValue={(c.agencyRenewCents / 100).toString()} inputMode="decimal" style={{ width: 120 }} /></label>
                    <label style={{ fontSize: 13 }}>Agencia: reactivación<input name="agencyReactivate" defaultValue={(c.agencyReactivateCents / 100).toString()} inputMode="decimal" style={{ width: 120 }} /></label>
                    <button className="btn sm">{ok === "sim" ? "Guardado ✓" : "Guardar"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel" style={{ padding: 18 }}>
        <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 6 }}>Límites de equipos al registrarse (marcas blancas)</h2>
        <p className="hint" style={{ marginBottom: 12 }}>La empresa elige uno al registrarse; es la cantidad máxima de equipos que puede subir. Tú lo puedes subir después desde la empresa.</p>
        <table className="t">
          <thead><tr><th>Equipos</th><th>Nombre · visible · destacado</th></tr></thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} style={ok === p.id ? { background: "#f0fdf4" } : undefined}>
                <td><b>{p.devices}</b></td>
                <td>
                  <form action={savePlanAction} className="row">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="price" value={(p.priceCents / 100).toString()} />
                    <input type="hidden" name="features" value={p.features} />
                    <input name="name" defaultValue={p.name} style={{ width: 150 }} aria-label="Nombre" />
                    <label className="row" style={{ fontSize: 13 }}><input type="checkbox" name="active" defaultChecked={p.active} style={{ width: "auto" }} /> Visible</label>
                    <label className="row" style={{ fontSize: 13 }}><input type="checkbox" name="highlighted" defaultChecked={p.highlighted} style={{ width: "auto" }} /> Destacado</label>
                    <button className="btn sm">{ok === p.id ? "Guardado ✓" : "Guardar"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
