"use client";

import { useActionState } from "react";
import { linkWhatsAppAction, type LinkState } from "./actions";

export function LinkForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<LinkState, FormData>(linkWhatsAppAction, {});
  if (state.ok) return <div className="ok">Listo, tu WhatsApp quedó conectado. Vuelve a WhatsApp y pregúntame, por ejemplo: “¿Dónde está mi carro?”</div>;
  return (
    <form action={action} className="form">
      {state.error && <div className="err" role="alert">{state.error}</div>}
      <input type="hidden" name="t" value={token} />
      <label>Correo de tu plataforma de rastreo<input name="email" type="email" required autoComplete="email" /></label>
      <label>Contraseña<input name="password" type="password" required autoComplete="current-password" /></label>
      <button className="btn dark" disabled={pending}>{pending ? "Conectando..." : "Conectar mi WhatsApp"}</button>
      <p className="hint">Tu contraseña no se guarda. Solo se usa para confirmar que eres tú.</p>
    </form>
  );
}
