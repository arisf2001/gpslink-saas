"use client";

import { useActionState } from "react";
import { saveSubdomainAction, saveWebsiteAction, type WebsiteState } from "./actions";

function Status({ state }: { state: WebsiteState }) {
  if (state.error) return <p style={{ color: "var(--r)", margin: 0 }}>{state.error}</p>;
  if (state.ok) return <p style={{ color: "var(--g)", margin: 0 }}>Guardado.</p>;
  return null;
}

export function WebsiteForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState<WebsiteState, FormData>(saveWebsiteAction, {});
  return (
    <form action={action} className="form" style={{ display: "grid", gap: 10 }}>
      <label>
        Dirección de tu web
        <input name="websiteUrl" defaultValue={current} placeholder="https://tumarca.com" />
      </label>
      <Status state={state} />
      <button className="btn" disabled={pending} style={{ justifySelf: "start" }}>{pending ? "Guardando…" : "Guardar"}</button>
    </form>
  );
}

export function SubdomainForm({ current, root }: { current: string; root: string }) {
  const [state, action, pending] = useActionState<WebsiteState, FormData>(saveSubdomainAction, {});
  return (
    <form action={action} className="form" style={{ display: "grid", gap: 10 }}>
      <label>
        Tu subdominio
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input name="subdomain" defaultValue={current} placeholder="tumarca" style={{ maxWidth: 260 }} />
          <b>.{root}</b>
        </span>
      </label>
      <Status state={state} />
      <button className="btn" disabled={pending} style={{ justifySelf: "start" }}>{pending ? "Guardando…" : "Guardar"}</button>
    </form>
  );
}
