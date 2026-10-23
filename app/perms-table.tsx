import { MODES, groupedPerms, type PermMap } from "@/lib/perms";

export function PermsTable({ available, current }: { available: PermMap; current: PermMap }) {
  return (
    <>
      <input type="hidden" name="permNames" value={Object.keys(available).join(",")} />
      {groupedPerms(available).map(([title, items]) => (
        <div key={title} style={{ marginTop: 10 }}>
          <b style={{ fontSize: 14 }}>{title}</b>
          <table className="t" style={{ marginTop: 6 }}>
            <thead><tr><th style={{ width: "55%" }} />{MODES.map(([mode, , label]) => <th key={mode} style={{ textAlign: "center" }}>{label}</th>)}</tr></thead>
            <tbody>
              {items.map(([name, label]) => (
                <tr key={name}>
                  <td>{label}</td>
                  {MODES.map(([mode]) => {
                    const allowed = !!available[name]?.[mode];
                    return (
                      <td key={mode} style={{ textAlign: "center" }}>
                        <input type="checkbox" name={`perm:${name}:${mode}`} defaultChecked={allowed && !!current[name]?.[mode]} disabled={!allowed} title={allowed ? undefined : "No disponible"} style={{ width: 18, height: 18 }} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
