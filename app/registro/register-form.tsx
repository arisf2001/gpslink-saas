"use client";

import { useActionState } from "react";
import { registerAction, type RegisterState } from "./actions";

type PlanOption = { id: string; label: string };

export function RegisterForm({ plans, planId }: { plans: PlanOption[]; planId: string }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerAction, {});
  const v = state.values ?? {};
  return (
    <form action={action} className="form">
      {state.error && <div className="err" role="alert">{state.error}</div>}
      <label>
        Paquete
        <select name="planId" defaultValue={v.planId ?? planId} required>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      <label>
        Nombre de tu empresa
        <input name="name" defaultValue={v.name} required placeholder="Ej. Rastreo Pérez" />
      </label>
      <label>
        Código de empresa
        <input name="slug" defaultValue={v.slug} placeholder="Ej. perez" />
        <span className="hint">Letras, números y guiones; será tu subdominio. Tus clientes lo usarán en la app. Si lo dejas vacío usamos el nombre.</span>
      </label>
      <label>
        Tu nombre
        <input name="contactName" defaultValue={v.contactName} required />
      </label>
      <label>
        Correo
        <input name="email" type="email" defaultValue={v.email} required autoComplete="email" />
        <span className="hint">Con este correo entras a tu plataforma de rastreo.</span>
      </label>
      <label>
        WhatsApp
        <input name="phone" type="tel" defaultValue={v.phone} required placeholder="1 809 555 1234" />
        <span className="hint">Aquí te enviamos los avisos.</span>
      </label>
      <label>
        Contraseña
        <input name="password" type="password" required autoComplete="new-password" minLength={8} />
        <span className="hint">Mínimo 8 caracteres, con mayúsculas, minúsculas y números.</span>
      </label>
      <label>
        Repite la contraseña
        <input name="password2" type="password" required autoComplete="new-password" minLength={8} />
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
        <input name="terms" type="checkbox" required style={{ width: "auto" }} /> Acepto los términos del servicio
      </label>
      <button className="btn" disabled={pending}>{pending ? "Creando tu plataforma..." : "Crear mi cuenta gratis"}</button>
      <p className="hint" style={{ textAlign: "center" }}>No pedimos tarjeta. Te avisamos 3, 2 y 1 día antes de que termine la prueba.</p>
    </form>
  );
}
