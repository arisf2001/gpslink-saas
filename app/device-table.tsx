import { problems, type AlertConfig, type DeviceStatus } from "@/lib/device-status";

const RED = "#b91c1c";

function ago(d: Date | null, now: Date): string {
  if (!d) return "Nunca";
  const min = Math.max(0, Math.round((now.getTime() - d.getTime()) / 60_000));
  if (min < 60) return `hace ${min} min`;
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} días`;
}

const bars = (n: number) => "▮".repeat(n) + "▯".repeat(4 - n);
const na = <span className="hint">—</span>;

export function sortByProblems(rows: DeviceStatus[], now: Date, cfg: AlertConfig): DeviceStatus[] {
  return [...rows].sort((a, b) => problems(b, now, cfg).length - problems(a, now, cfg).length || a.name.localeCompare(b.name));
}

export function DeviceTable({ rows, now, cfg, brandOf }: { rows: DeviceStatus[]; now: Date; cfg: AlertConfig; brandOf?: Map<number, string> }) {
  return (
    <table className="t">
      <thead>
        <tr>
          <th>Equipo</th>
          {brandOf && <th>Marca blanca</th>}
          <th>Último reporte</th>
          <th>Batería</th>
          <th>Señal</th>
          <th>Satélites</th>
          <th>Corriente</th>
          <th>Motor</th>
          <th>Revisar</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={brandOf ? 9 : 8} className="hint">No hay equipos en esta lista.</td></tr>}
        {rows.map((s) => {
          const p = problems(s, now, cfg);
          const offline = !s.lastReport || p.some((x) => x.includes("sin reportar"));
          return (
            <tr key={s.deviceId}>
              <td>{s.name}{s.plate && <div className="hint">{s.plate}</div>}</td>
              {brandOf && <td>{brandOf.get(s.deviceId) ?? "GPS Link directo"}</td>}
              <td style={offline ? { color: RED } : undefined}>{ago(s.lastReport, now)}</td>
              <td style={p.includes("Batería baja") ? { color: RED, fontWeight: 600 } : undefined}>{s.battery === null ? na : `${s.battery} %`}</td>
              <td>{s.signal === null ? na : <span title={`${s.signal} de 4`}>{bars(s.signal)} {s.signal}/4</span>}</td>
              <td>{s.satellites ?? na}</td>
              <td style={s.charging === false ? { color: RED, fontWeight: 600 } : undefined}>{s.charging === null ? na : s.charging ? "Conectado" : "Desconectado"}{s.voltage !== null && <div className="hint">{s.voltage} V</div>}</td>
              <td>{s.blocked === null ? na : s.blocked ? "Bloqueado" : "Normal"}</td>
              <td style={{ color: p.length ? RED : undefined, fontSize: 13 }}>{p.length ? p.join(" · ") : "Bien"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
