import type { SimCard } from "@prisma/client";
import { simCommandAction } from "./actions";

export const COMMANDS: Record<number, { op: string; label: string; note: string; danger?: boolean }> = {
  1: { op: "activate", label: "Activar plan", note: "Su plan de 12 meses empieza a contar desde hoy, aunque el equipo no esté instalado." },
  2: { op: "suspend", label: "Suspender", note: "El equipo se queda sin internet hasta que la reactives.", danger: true },
  3: { op: "resume", label: "Reactivar", note: "El equipo vuelve a tener internet." },
};

export function SimCommand({ card, back }: { card: SimCard; back: string }) {
  const c = COMMANDS[card.status];
  if (!c || card.carrierCode !== "telebay") return null;
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
