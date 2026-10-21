"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="form">
      {state.error && <div className="err" role="alert">{state.error}</div>}
      <label>Correo<input name="email" type="email" required autoComplete="email" /></label>
      <label>Contraseña<input name="password" type="password" required autoComplete="current-password" /></label>
      <p className="hint">Si ya eres marca blanca en GPS Link, entra con el mismo correo y contraseña de tu plataforma.</p>
      <button className="btn dark" disabled={pending}>{pending ? "Entrando..." : "Entrar"}</button>
      <p className="hint" style={{ textAlign: "center" }}>¿No tienes cuenta? <Link href="/#planes" style={{ color: "var(--p)", fontWeight: 700 }}>Empieza gratis</Link></p>
    </form>
  );
}
