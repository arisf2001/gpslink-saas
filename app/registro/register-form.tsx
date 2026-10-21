"use client";

import { useActionState } from "react";
import { codeAction, registerAction, type RegisterState } from "./actions";

type PlanOption = { id: string; label: string };

export function RegisterForm({ plans, planId }: { plans: PlanOption[]; planId: string }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerAction, {});
  const v = state.values ?? {};
  if (state.step === "code") return <CodeForm start={state} />;
  return (
    <form action={action} className="form">
      {state.error && <div className="err" role="alert">{state.error}</div>}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
      <label>
        Equipos para tu prueba
        <select name="planId" defaultValue={v.planId ?? planId} required>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <span className="hint">Es la cantidad máxima de equipos que puedes subir; se puede aumentar después. Solo pagas los equipos que subes.</span>
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
      <button className="btn" disabled={pending}>{pending ? "Enviando código..." : "Crear mi cuenta gratis"}</button>
      <p className="hint" style={{ textAlign: "center" }}>No pedimos tarjeta. Te avisamos 3, 2 y 1 día antes de que termine la prueba.</p>
    </form>
  );
}

function CodeForm({ start }: { start: RegisterState }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(codeAction, start);
  if (state.step !== "code") return <RegisterFormAgain state={state} />;
  return (
    <form action={action} className="form">
      <input type="hidden" name="vid" value={state.vid ?? ""} />
      <p style={{ margin: 0 }}>Te enviamos un código de 6 números a <b>{state.email}</b>. Escríbelo aquí para crear tu cuenta.</p>
      {state.error && <div className="err" role="alert">{state.error}</div>}
      {state.info && !state.error && <div className="hint" role="status">{state.info}</div>}
      <label>
        Código
        <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus placeholder="123456" style={{ fontSize: 22, letterSpacing: 6, textAlign: "center" }} />
        <span className="hint">Vence en 15 minutos. Si no lo ves, revisa el correo no deseado (spam).</span>
      </label>
      <button className="btn" name="op" value="verify" disabled={pending}>{pending ? "Verificando..." : "Verificar y crear mi cuenta"}</button>
      <p className="hint" style={{ textAlign: "center" }}>
        <button type="submit" name="op" value="resend" formNoValidate disabled={pending} style={{ background: "none", border: 0, color: "inherit", textDecoration: "underline", cursor: "pointer", padding: 0 }}>Reenviar código</button>
        {" · "}
        <a href="/registro">Cambiar mis datos</a>
      </p>
    </form>
  );
}

function RegisterFormAgain({ state }: { state: RegisterState }) {
  return (
    <div className="form">
      {state.error && <div className="err" role="alert">{state.error}</div>}
      <a className="btn" href="/registro" style={{ textAlign: "center" }}>Volver al formulario</a>
    </div>
  );
}
