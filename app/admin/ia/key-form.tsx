"use client";

import { useActionState } from "react";
import { createAppKeyAction, type KeyState } from "./actions";

export function KeyForm() {
  const [state, action, pending] = useActionState<KeyState, FormData>(createAppKeyAction, {});
  return (
    <form action={action} className="form" style={{ maxWidth: 520 }}>
      {state.error && <div className="err">{state.error}</div>}
      {state.key && (
        <div className="ok">
          Copia esta llave ahora y dásela a tu programador; no se vuelve a mostrar:<br />
          <code style={{ userSelect: "all", wordBreak: "break-all" }}>{state.key}</code>
        </div>
      )}
      <label>Nombre<input name="name" placeholder="App de las marcas blancas" required /></label>
      <button className="btn sm dark" disabled={pending}>Generar llave nueva</button>
    </form>
  );
}
