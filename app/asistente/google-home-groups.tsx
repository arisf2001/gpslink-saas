import { resolveUser } from "@/lib/ai/assistant";
import * as gps from "@/lib/ai/gps";
import { groupKey, homeGroups } from "@/lib/google-home";
import { googleHomeGroupsAction } from "./actions";

// Lets the user choose which of their GPS groups show up in Google Home (each vehicle as a device, the group as its room).
export async function GoogleHomeGroups({ hash, embed, saved }: { hash: string; embed: boolean; saved: boolean }) {
  const data = await Promise.all([resolveUser(hash), gps.vehicles(hash), gps.userInfo(hash)]).catch(() => null);
  if (!data) return null;
  const [user, fleet, info] = data;
  const counts = new Map<string, { title: string; n: number }>();
  for (const v of fleet) {
    const k = groupKey(v.group);
    const c = counts.get(k) ?? { title: v.group?.trim() || "Sin grupo", n: 0 };
    c.n++;
    counts.set(k, c);
  }
  if (counts.size < 2) return null;
  const chosen = await homeGroups(user.userId, info.groupId === 1);
  const list = [...counts.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  return (
    <form action={googleHomeGroupsAction} className="panel" id="google-home" style={{ maxWidth: 720, margin: "10px auto 0", padding: 14 }}>
      <input type="hidden" name="embed" value={embed ? "1" : ""} />
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Google Home: grupos que se agregan</div>
      <p className="hint" style={{ margin: "0 0 8px" }}>Cada vehículo de los grupos marcados sale en Google Home como un dispositivo, con el grupo como habitación. Después de guardar, vuelve a vincular GPS Link en la app Google Home para que cargue los cambios.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginBottom: 10 }}>
        {list.map(([k, c]) => (
          <label key={k || "_none"} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" name="group" value={k} defaultChecked={chosen ? chosen.includes(k) : true} />
            {c.title} <span className="hint">({c.n})</span>
          </label>
        ))}
      </div>
      <button className="btn sm dark">Guardar</button>
      {saved && <span className="hint" style={{ marginLeft: 8 }}>Guardado. Vuelve a vincular en Google Home.</span>}
    </form>
  );
}
