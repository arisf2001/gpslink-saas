"use client";

import { startTransition, useActionState } from "react";
import { activarLoginAction, startActivationAction, type FormState } from "./actions";

export function ActivarLogin() {
  const [state, action, pending] = useActionState<FormState, FormData>(activarLoginAction, {});
  return (
    <form action={action} className="form">
      {state.error && <div className="err" role="alert">{state.error}</div>}
      <label>Correo de tu plataforma de rastreo<input name="email" type="email" required autoComplete="email" /></label>
      <label>Contraseña<input name="password" type="password" required autoComplete="current-password" /></label>
      <button className="btn dark" disabled={pending}>{pending ? "Entrando..." : "Entrar"}</button>
      <p className="hint">Usa el mismo usuario y contraseña con los que entras a ver tus vehículos.</p>
    </form>
  );
}

export function ActivarForm({ models }: { models: { key: string; label: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(startActivationAction, {});
  // onSubmit instead of action={...} so the fields are not cleared when the server returns an error.
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      {state.error && <div className="err" role="alert">{state.error}</div>}
      <label>Modelo de tu equipo
        <select name="model" required defaultValue="">
          <option value="" disabled>Escoge…</option>
          {models.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </label>
      <label>IMEI (15 números, en la etiqueta del equipo)<input name="imei" inputMode="numeric" required maxLength={20} /></label>
      <label>Nombre del vehículo<input name="name" required maxLength={100} placeholder="Ej.: Corolla blanco" /></label>
      <button className="btn dark" disabled={pending}>{pending ? "Abriendo pago..." : "Continuar y poner mi tarjeta"}</button>
    </form>
  );
}
