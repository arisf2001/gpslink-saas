"use client";

import { useActionState } from "react";
import { trackLoginAction, type TrackLoginState } from "./actions";

const T = {
  es: { title: "Entrar a la plataforma de rastreo", email: "Correo", password: "Contraseña", signing: "Entrando…", signIn: "Entrar", google: "Entrar con Google" },
  en: { title: "Sign in to the tracking platform", email: "Email", password: "Password", signing: "Signing in…", signIn: "Sign in", google: "Sign in with Google" },
};

export function TrackLoginForm({ googleUrl, compact = false, initialError, lang = "es" }: { googleUrl: string; compact?: boolean; initialError?: string; lang?: "es" | "en" }) {
  const t = T[lang];
  const [state, action, pending] = useActionState<TrackLoginState, FormData>(trackLoginAction, { error: initialError });
  return (
    <form action={action} className={`form trackbox${compact ? " compact" : ""}`}>
      <b>{t.title}</b>
      <input name="email" type="email" placeholder={t.email} autoComplete="username" required defaultValue={state.email} key={state.email} />
      <input name="password" type="password" placeholder={t.password} autoComplete="current-password" required />
      {state.error && <p className="err">{state.error}</p>}
      <button className="btn" disabled={pending}>{pending ? t.signing : t.signIn}</button>
      <a href={googleUrl} className="btn google">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
        {t.google}
      </a>
    </form>
  );
}
