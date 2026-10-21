"use client";

import { useActionState } from "react";
import { saveWebsiteAction, type WebsiteState } from "./actions";

export function WebsiteForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState<WebsiteState, FormData>(saveWebsiteAction, {});
  return (
    <form action={action} className="form" style={{ display: "grid", gap: 10 }}>
      <label>
        Dirección de tu web
        <input name="websiteUrl" defaultValue={current} placeholder="https://tumarca.com" />
      </label>
      {state.error && <p style={{ color: "var(--r)", margin: 0 }}>{state.error}</p>}
      {state.ok && <p style={{ color: "var(--g)", margin: 0 }}>Guardado.</p>}
      <button className="btn" disabled={pending} style={{ justifySelf: "start" }}>{pending ? "Guardando…" : "Guardar"}</button>
    </form>
  );
}
