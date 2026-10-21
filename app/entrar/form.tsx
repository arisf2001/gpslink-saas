"use client";

import { useActionState } from "react";
import { trackLoginAction, type TrackLoginState } from "./actions";

export function TrackLoginForm({ compact = false }: { compact?: boolean }) {
  const [state, action, pending] = useActionState<TrackLoginState, FormData>(trackLoginAction, {});
  return (
    <form action={action} className={`form trackbox${compact ? " compact" : ""}`}>
      <b>Entrar a la plataforma de rastreo</b>
      <input name="email" type="email" placeholder="Correo" autoComplete="username" required defaultValue={state.email} key={state.email} />
      <input name="password" type="password" placeholder="Contraseña" autoComplete="current-password" required />
      {state.error && <p className="err">{state.error}</p>}
      <button className="btn" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
