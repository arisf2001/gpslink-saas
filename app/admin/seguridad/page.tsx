import { readFile } from "node:fs/promises";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AdminShell } from "../admin-shell";
import { allowIpAction, blockIpAction, forgetIpAction } from "./actions";

export const dynamic = "force-dynamic";

type Entry = { ip: string; country: string; org: string; gps: number; ssh: number; ports: string[]; first: string; last: string; status: "intento" | "bloqueada" | "habilitada" };

const STATUS = { intento: "1 intento", bloqueada: "Bloqueada", habilitada: "Habilitada" } as const;
const FILTERS = { bloqueada: "Bloqueadas", habilitada: "Habilitadas", intento: "1 intento", todas: "Todas" } as const;
const regionName = new Intl.DisplayNames(["es"], { type: "region" });

function country(code: string) {
  if (!code) return "?";
  try {
    return `${regionName.of(code) ?? code} (${code})`;
  } catch {
    return code;
  }
}

function when(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "short", timeStyle: "short" });
}

async function loadEntries(): Promise<Entry[]> {
  try {
    return Object.values(JSON.parse(await readFile("/var/lib/gps-guard/blocked.json", "utf8"))) as Entry[];
  } catch {
    return [];
  }
}

export default async function AdminSeguridadPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; ver?: string; q?: string }> }) {
  if (!(await getSession("admin"))) redirect("/admin");
  const { ok, error, ver = "bloqueada", q = "" } = await searchParams;
  const all = await loadEntries();
  const counts = { bloqueada: 0, habilitada: 0, intento: 0, todas: all.length };
  for (const e of all) counts[e.status]++;
  const needle = q.trim().toLowerCase();
  const rows = all
    .filter((e) => ver === "todas" || e.status === ver)
    .filter((e) => !needle || `${e.ip} ${e.country} ${country(e.country)} ${e.org}`.toLowerCase().includes(needle))
    .sort((a, b) => (b.last ?? "").localeCompare(a.last ?? ""))
    .slice(0, 500);

  return (
    <AdminShell>
      <h1 className="page-title">Seguridad · IPs bloqueadas</h1>
      {ok && <div className="ok" style={{ margin: "10px 0" }}>{ok}</div>}
      {error && <div className="err" style={{ margin: "10px 0" }}>{error}</div>}
      <p className="hint" style={{ margin: "10px 0" }}>
        Los equipos GPS solo pueden conectarse desde República Dominicana, Estados Unidos y China (incluye Hong Kong). Cualquier otra IP que intente entrar a los puertos del GPS, o que falle 2 veces la clave del servidor (SSH), queda bloqueada y aparece aquí. Si reconoces una IP, pulsa “Habilitar” y podrá entrar siempre.
      </p>
      <form className="row" style={{ gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        {Object.entries(FILTERS).map(([k, label]) => (
          <a key={k} href={`/admin/seguridad?ver=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`btn sm${ver === k ? " dark" : ""}`}>
            {label} ({counts[k as keyof typeof counts]})
          </a>
        ))}
        <input type="hidden" name="ver" value={ver} />
        <input name="q" defaultValue={q} placeholder="Buscar IP, país o red" style={{ maxWidth: 240 }} />
        <button className="btn sm">Buscar</button>
      </form>
      <div className="panel" style={{ overflowX: "auto" }}>
        <table className="t">
          <thead>
            <tr><th>IP</th><th>País</th><th>Red</th><th>Intentos GPS</th><th>Intentos SSH</th><th>Puertos</th><th>Primera vez</th><th>Última vez</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--muted)" }}>No hay IPs en esta lista.</td></tr>}
            {rows.map((e) => (
              <tr key={e.ip}>
                <td><code>{e.ip}</code></td>
                <td>{country(e.country)}</td>
                <td style={{ maxWidth: 220 }}>{e.org}</td>
                <td>{e.gps}</td>
                <td>{e.ssh}</td>
                <td style={{ maxWidth: 160 }}>{e.ports.slice(0, 5).join(", ")}{e.ports.length > 5 ? "…" : ""}</td>
                <td>{when(e.first)}</td>
                <td>{when(e.last)}</td>
                <td>{e.status === "bloqueada" ? <span style={{ color: "#b91c1c" }}>{STATUS[e.status]}</span> : STATUS[e.status]}</td>
                <td>
                  <div className="row" style={{ gap: 6 }}>
                    {e.status === "habilitada" ? (
                      <form action={blockIpAction}><input type="hidden" name="ip" value={e.ip} /><button className="btn sm red">Bloquear</button></form>
                    ) : (
                      <form action={allowIpAction}><input type="hidden" name="ip" value={e.ip} /><button className="btn sm dark">Habilitar</button></form>
                    )}
                    <form action={forgetIpAction}><input type="hidden" name="ip" value={e.ip} /><button className="btn sm">Quitar</button></form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 500 && <p className="hint" style={{ marginTop: 8 }}>Se muestran las 500 más recientes. Usa el buscador para ver otras.</p>}
      </div>
    </AdminShell>
  );
}
