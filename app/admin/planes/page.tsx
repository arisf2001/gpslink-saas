import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ensureDefaultPlans } from "@/lib/plans";
import { getSession } from "@/lib/session";
import { savePlanAction, saveTiersAction } from "../actions";
import { AdminShell } from "../admin-shell";

export const dynamic = "force-dynamic";

export default async function PlanesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  if (!(await getSession("admin"))) redirect("/admin");
  const { ok, error } = await searchParams;
  await ensureDefaultPlans();
  const plans = await prisma.plan.findMany({ orderBy: [{ sortOrder: "asc" }, { devices: "asc" }] });
  const tiers = await prisma.priceTier.findMany({ orderBy: { minDevices: "asc" } });

  return (
    <AdminShell>
      <h1 className="page-title">Planes y precios</h1>
      {error && <div className="err" style={{ marginBottom: 10 }}>Precio no válido. Usa solo números, por ejemplo 6 o 5.50.</div>}
      <div className="panel" style={{ marginBottom: 18, padding: 18 }}>
        <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 6 }}>Precio por equipo al año (USD)</h2>
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
      <div className="panel" style={{ padding: 18 }}>
        <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 6 }}>Límites de equipos al registrarse</h2>
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
