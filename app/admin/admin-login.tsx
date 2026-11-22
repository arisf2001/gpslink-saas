"use client";

import { useActionState } from "react";
import { adminLoginAction, type FormState } from "./actions";

export function AdminLogin() {
  const [state, action, pending] = useActionState<FormState, FormData>(adminLoginAction, {});
  return (
    <form action={action} className="form">
      {state.error && <div className="err" role="alert">{state.error}</div>}
      <label>Usuario<input name="username" required autoComplete="username" /></label>
      <label>Contraseña<input name="password" type="password" required autoComplete="current-password" /></label>
      <button className="btn dark" disabled={pending}>Entrar</button>
    </form>
  );
}
