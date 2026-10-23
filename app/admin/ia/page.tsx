import { redirect } from "next/navigation";
import { aiSetting } from "@/lib/ai/assistant";
import { monthStart } from "@/lib/billing";
import { prisma } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { getSession } from "@/lib/session";
import { AdminShell } from "../admin-shell";
import { revokeAppKeyAction, saveAiSettingAction, setCompanyAiAction } from "./actions";
import { KeyForm } from "./key-form";

export const dynamic = "force-dynamic";

const usd = (cents: number) => (cents / 100).toFixed(2);

export default async function AdminIaPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  if (!(await getSession("admin"))) redirect("/admin");
  const { ok, error } = await searchParams;
  const setting = await aiSetting();
  const since = monthStart(new Date());
  const [companies, keys, usage, commands] = await Promise.all([
    prisma.company.findMany({ orderBy: { name: "asc" } }),
    prisma.aiAppKey.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.aiConversation.groupBy({ by: ["companyId"], where: { updatedAt: { gte: since } }, _count: { _all: true }, _sum: { turns: true, tokensIn: true, tokensOut: true } }),
    prisma.aiCommandLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const usageOf = (id: string | null) => usage.find((u) => u.companyId === id);
  const names = new Map(companies.map((c) => [c.id, c.name]));
  const direct = usageOf(null);

  return (
    <AdminShell>
      <h1 className="page-title">Asistente IA</h1>
      {ok && <div className="ok" style={{ margin: "10px 0" }}>{ok}</div>}
      {error && <div className="err" style={{ margin: "10px 0" }}>Revisa el precio.</div>}

      <div className="panel" style={{ margin: "14px 0" }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Precio y ajustes</h2>
        <form action={saveAiSettingAction} className="form" style={{ maxWidth: 520 }}>
          <label>Precio mensual por marca blanca (US$)<input name="price" defaultValue={usd(setting.monthlyPriceCents)} inputMode="decimal" /></label>
          <p className="hint">Se suma a la factura de fin de mes de cada marca blanca que tenga la IA activa, cuando termina su prueba gratis. Con 0 no se cobra.</p>
          <label>Modelo de OpenAI
            <select name="model" defaultValue={setting.model}><option value="gpt-5-mini">gpt-5-mini (recomendado, económico)</option><option value="gpt-5">gpt-5 (más capaz, más caro)</option><option value="gpt-4.1-mini">gpt-4.1-mini</option></select>
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="enabled" defaultChecked={setting.enabled} style={{ width: "auto" }} /> Activar la IA para los clientes directos de GPS Link</label>
          <button className="btn sm dark">Guardar</button>
        </form>
      </div>

      <div className="panel" style={{ margin: "14px 0" }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Marcas blancas</h2>
        <table className="t">
          <thead><tr><th>Empresa</th><th>Conversaciones este mes</th><th>Mensajes</th><th>Tokens</th><th>IA</th></tr></thead>
          <tbody>
            {companies.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)" }}>Todavía no hay empresas.</td></tr>}
            {companies.map((c) => {
              const u = usageOf(c.id);
              return (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{u?._count._all ?? 0}</td>
                  <td>{u?._sum.turns ?? 0}</td>
                  <td>{((u?._sum.tokensIn ?? 0) + (u?._sum.tokensOut ?? 0)).toLocaleString("es-DO")}</td>
                  <td>
                    <form action={setCompanyAiAction} className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                      <input type="hidden" name="companyId" value={c.id} />
                      <label style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" name="aiEnabled" defaultChecked={c.aiEnabled} /> Activa</label>
                      <input name="aiName" defaultValue={c.aiName ?? ""} placeholder={`Asistente ${c.name}`} style={{ width: 170 }} />
                      <input name="brandColor" type="color" defaultValue={c.brandColor ?? "#0F4C5C"} />
                      <button className="btn sm s">Guardar</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            <tr><td><i>Clientes directos de GPS Link</i></td><td>{direct?._count._all ?? 0}</td><td>{direct?._sum.turns ?? 0}</td><td>{((direct?._sum.tokensIn ?? 0) + (direct?._sum.tokensOut ?? 0)).toLocaleString("es-DO")}</td><td>{setting.enabled ? "Activa" : "Apagada"}</td></tr>
          </tbody>
        </table>
        <p className="hint" style={{ marginTop: 8 }}>Precio actual: {formatMoney(setting.monthlyPriceCents)} al mes por marca blanca.</p>
      </div>

      <div className="panel" style={{ margin: "14px 0" }}>
        <h2 style={{ fontSize: 18, marginBottom: 6 }}>Llaves de la app (API)</h2>
        <p className="hint" style={{ marginBottom: 10 }}>La llave identifica la app que usa el botón de IA. Por sí sola no da acceso a datos: cada cliente usa su propia sesión.</p>
        <KeyForm />
        <table className="t" style={{ marginTop: 12 }}>
          <thead><tr><th>Nombre</th><th>Empieza con</th><th>Creada</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td><td><code>{k.prefix}…</code></td><td>{formatDate(k.createdAt)}</td><td>{k.revokedAt ? "Desactivada" : "Activa"}</td>
                <td>{!k.revokedAt && <form action={revokeAppKeyAction}><input type="hidden" name="id" value={k.id} /><button className="btn sm red">Desactivar</button></form>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ margin: "14px 0" }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Últimas órdenes de motor</h2>
        <table className="t">
          <thead><tr><th>Fecha</th><th>Empresa</th><th>Vehículo</th><th>Orden</th><th>Canal</th><th>Resultado</th></tr></thead>
          <tbody>
            {commands.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)" }}>Ninguna todavía.</td></tr>}
            {commands.map((c) => (
              <tr key={c.id}>
                <td>{c.createdAt.toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" })}</td>
                <td>{c.companyId ? names.get(c.companyId) ?? "—" : "GPS Link"}</td>
                <td>{c.deviceName}</td>
                <td>{c.command === "engine_stop" ? "Apagar" : "Encender"}</td>
                <td>{c.channel}</td>
                <td>{c.ok ? "Enviada" : `Falló: ${c.error ?? ""}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
