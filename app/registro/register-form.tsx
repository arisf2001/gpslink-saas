"use client";

import { useActionState } from "react";
import { codeAction, registerAction, type RegisterState } from "./actions";

type PlanOption = { id: string; label: string };

const T = {
  es: {
    plan: "Equipos para tu prueba", planHint: "Es la cantidad máxima de equipos que puedes subir; se puede aumentar después. Solo pagas los equipos que subes.",
    name: "Nombre de tu empresa", namePh: "Ej. Rastreo Pérez", slug: "Código de empresa", slugPh: "Ej. perez", slugHint: "Letras, números y guiones; será tu subdominio. Tus clientes lo usarán en la app. Si lo dejas vacío usamos el nombre.",
    contact: "Tu nombre", email: "Correo", emailHint: "Con este correo entras a tu plataforma de rastreo.", wa: "WhatsApp", waHint: "Aquí te enviamos los avisos.",
    pass: "Contraseña", passHint: "Mínimo 8 caracteres, con mayúsculas, minúsculas y números.", pass2: "Repite la contraseña", terms: "Acepto los términos del servicio",
    sending: "Enviando código...", submit: "Crear mi cuenta gratis", noCard: "No pedimos tarjeta. Te avisamos 3, 2 y 1 día antes de que termine la prueba.",
    sent: "Te enviamos un código de 6 números a", sent2: ". Escríbelo aquí para crear tu cuenta.", code: "Código", codeHint: "Vence en 15 minutos. Si no lo ves, revisa el correo no deseado (spam).",
    verifying: "Verificando...", verify: "Verificar y crear mi cuenta", resend: "Reenviar código", change: "Cambiar mis datos", back: "Volver al formulario",
  },
  en: {
    plan: "Devices for your trial", planHint: "The maximum number of devices you can add; you can raise it later. You only pay for the devices you add.",
    name: "Company name", namePh: "E.g. Perez Tracking", slug: "Company code", slugPh: "E.g. perez", slugHint: "Letters, numbers and dashes; it will be your subdomain. Your clients will use it in the app. If you leave it empty we use the name.",
    contact: "Your name", email: "Email", emailHint: "You sign in to your tracking platform with this email.", wa: "WhatsApp", waHint: "We send you notices here.",
    pass: "Password", passHint: "At least 8 characters, with uppercase, lowercase and numbers.", pass2: "Repeat the password", terms: "I accept the terms of service",
    sending: "Sending code...", submit: "Create my free account", noCard: "No card needed. We remind you 3, 2 and 1 day before the trial ends.",
    sent: "We sent a 6-digit code to", sent2: ". Enter it here to create your account.", code: "Code", codeHint: "It expires in 15 minutes. If you don't see it, check your spam folder.",
    verifying: "Verifying...", verify: "Verify and create my account", resend: "Resend code", change: "Change my details", back: "Back to the form",
  },
};
type Dict = (typeof T)["es"];


export function RegisterForm({ plans, planId, lang = "es" }: { plans: PlanOption[]; planId: string; lang?: "es" | "en" }) {
  const t = T[lang];
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerAction, {});
  const v = state.values ?? {};
  if (state.step === "code") return <CodeForm start={state} t={t} />;
  return (
    <form action={action} className="form">
      {state.error && <div className="err" role="alert">{state.error}</div>}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
      <label>
        {t.plan}
        <select name="planId" defaultValue={v.planId ?? planId} required>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <span className="hint">{t.planHint}</span>
      </label>
      <label>
        {t.name}
        <input name="name" defaultValue={v.name} required placeholder={t.namePh} />
      </label>
      <label>
        {t.slug}
        <input name="slug" defaultValue={v.slug} placeholder={t.slugPh} />
        <span className="hint">{t.slugHint}</span>
      </label>
      <label>
        {t.contact}
        <input name="contactName" defaultValue={v.contactName} required />
      </label>
      <label>
        {t.email}
        <input name="email" type="email" defaultValue={v.email} required autoComplete="email" />
        <span className="hint">{t.emailHint}</span>
      </label>
      <label>
        {t.wa}
        <input name="phone" type="tel" defaultValue={v.phone} required placeholder="1 809 555 1234" />
        <span className="hint">{t.waHint}</span>
      </label>
      <label>
        {t.pass}
        <input name="password" type="password" required autoComplete="new-password" minLength={8} />
        <span className="hint">{t.passHint}</span>
      </label>
      <label>
        {t.pass2}
        <input name="password2" type="password" required autoComplete="new-password" minLength={8} />
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
        <input name="terms" type="checkbox" required style={{ width: "auto" }} /> {t.terms}
      </label>
      <button className="btn" disabled={pending}>{pending ? t.sending : t.submit}</button>
      <p className="hint" style={{ textAlign: "center" }}>{t.noCard}</p>
    </form>
  );
}

function CodeForm({ start, t }: { start: RegisterState; t: Dict }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(codeAction, start);
  if (state.step !== "code") return <RegisterFormAgain state={state} t={t} />;
  return (
    <form action={action} className="form">
      <input type="hidden" name="vid" value={state.vid ?? ""} />
      <p style={{ margin: 0 }}>{t.sent} <b>{state.email}</b>{t.sent2}</p>
      {state.error && <div className="err" role="alert">{state.error}</div>}
      {state.info && !state.error && <div className="hint" role="status">{state.info}</div>}
      <label>
        {t.code}
        <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus placeholder="123456" style={{ fontSize: 22, letterSpacing: 6, textAlign: "center" }} />
        <span className="hint">{t.codeHint}</span>
      </label>
      <button className="btn" name="op" value="verify" disabled={pending}>{pending ? t.verifying : t.verify}</button>
      <p className="hint" style={{ textAlign: "center" }}>
        <button type="submit" name="op" value="resend" formNoValidate disabled={pending} style={{ background: "none", border: 0, color: "inherit", textDecoration: "underline", cursor: "pointer", padding: 0 }}>{t.resend}</button>
        {" · "}
        <a href="/registro">{t.change}</a>
      </p>
    </form>
  );
}

function RegisterFormAgain({ state, t }: { state: RegisterState; t: Dict }) {
  return (
    <div className="form">
      {state.error && <div className="err" role="alert">{state.error}</div>}
      <a className="btn" href="/registro" style={{ textAlign: "center" }}>{t.back}</a>
    </div>
  );
}
