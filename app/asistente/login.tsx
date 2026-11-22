"use client";

import { useActionState } from "react";
import { iaLoginAction, type IaLoginState } from "./actions";

export function IaLogin({ embed }: { embed: boolean }) {
  const [state, action, pending] = useActionState<IaLoginState, FormData>(iaLoginAction, {});
  return (
    <form action={action} className="form">
      {state.error && <div className="err" role="alert">{state.error}</div>}
      <input type="hidden" name="embed" value={embed ? "1" : ""} />
      <label>Correo de tu plataforma de rastreo<input name="email" type="email" required autoComplete="email" /></label>
      <label>Contraseña<input name="password" type="password" required autoComplete="current-password" /></label>
      <button className="btn dark" disabled={pending}>{pending ? "Entrando..." : "Entrar"}</button>
      <p className="hint">Usa el mismo usuario y contraseña con los que entras a ver tus vehículos.</p>
    </form>
  );
}
