"use client";

import { useActionState } from "react";
import { authorizeAction, type AuthorizeState } from "./actions";
import type { AuthorizeRequest } from "./request";

export function AuthorizeForm({ req, color }: { req: AuthorizeRequest; color: string }) {
  const [state, action, pending] = useActionState<AuthorizeState, FormData>(authorizeAction, {});
  return (
    <form action={action} className="form">
      {state.error && <div className="err" role="alert">{state.error}</div>}
      <input type="hidden" name="client_id" value={req.clientId} />
      <input type="hidden" name="redirect_uri" value={req.redirectUri} />
      <input type="hidden" name="state" value={req.state} />
      <input type="hidden" name="code_challenge" value={req.challenge ?? ""} />
      <input type="hidden" name="brand" value={req.brand ?? ""} />
      <label>Correo de tu plataforma de rastreo<input key={state.email ?? ""} name="email" type="email" required autoComplete="email" defaultValue={state.email} /></label>
      <label>Contraseña<input name="password" type="password" required autoComplete="current-password" /></label>
      <button className="btn" style={{ background: color, borderColor: color, color: "#fff" }} disabled={pending}>{pending ? "Conectando..." : "Conectar"}</button>
    </form>
  );
}
