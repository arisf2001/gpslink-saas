import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { CATEGORY_LABELS } from "@/lib/format";
import { ensureDefaultPlans } from "@/lib/plans";
import { getSession } from "@/lib/session";
import { savePlanAction } from "../actions";
import { AdminShell } from "../admin-shell";

export const dynamic = "force-dynamic";

export default async function PlanesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  if (!(await getSession("admin"))) redirect("/admin");
  const { ok, error } = await searchParams;
  await ensureDefaultPlans();
  const plans = await prisma.plan.findMany({ orderBy: [{ sortOrder: "asc" }, { devices: "asc" }] });

  return (
    <AdminShell>
      <h1 className="page-title">Planes y precios</h1>
      <p className="hint" style={{ fontSize: 14, marginBottom: 12 }}>Precio por año en dólares. Si el precio está en 0, la página muestra &quot;Consultar&quot; y no se puede pagar en línea. Una característica por línea.</p>
      {error && <div className="err" style={{ marginBottom: 10 }}>Precio no válido. Usa solo números, por ejemplo 1490 o 1490.50.</div>}
      {(Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]).map((cat) => (
        <div key={cat} className="panel" style={{ marginBottom: 18, padding: 18 }}>
          <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 10 }}>{CATEGORY_LABELS[cat]}</h2>
          <table className="t">
            <thead><tr><th>Equipos</th><th>Nombre</th><th>Precio/año (USD)</th><th>Incluye</th><th>Visible</th><th>Destacado</th><th></th></tr></thead>
            <tbody>
              {plans.filter((p) => p.category === cat).map((p) => (
                <tr key={p.id} style={ok === p.id ? { background: "#f0fdf4" } : undefined}>
                  <td><b>{p.devices}</b></td>
                  <td colSpan={6} style={{ padding: 0 }}>
                    <form action={savePlanAction} className="row" style={{ padding: 10, alignItems: "flex-start" }}>
                      <input type="hidden" name="id" value={p.id} />
                      <input name="name" defaultValue={p.name} style={{ width: 130 }} aria-label="Nombre" />
                      <input name="price" defaultValue={(p.priceCents / 100).toString()} inputMode="decimal" aria-label="Precio por año" />
                      <textarea name="features" defaultValue={p.features} rows={3} style={{ flex: 1, minWidth: 240, font: "inherit", padding: 6, border: "1.5px solid #d1d5db", borderRadius: 8 }} aria-label="Incluye" />
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
      ))}
    </AdminShell>
  );
}
