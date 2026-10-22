"use client";

import { useState } from "react";
import type { BrandSmtp } from "@/lib/brand-mail";

type Preset = { label: string; host: string; port: number; security: "ssl" | "tls" | ""; help: string };

const PRESETS: Record<string, Preset> = {
  gmail: { label: "Gmail / Google Workspace", host: "smtp.gmail.com", port: 587, security: "tls", help: "En tu cuenta de Google activa la verificación en 2 pasos y crea una contraseña de aplicación en myaccount.google.com/apppasswords. Pon esa clave de 16 letras aquí, no tu contraseña normal." },
  outlook: { label: "Outlook / Hotmail / Microsoft 365", host: "smtp.office365.com", port: 587, security: "tls", help: "Usa tu correo y tu contraseña (o una contraseña de aplicación si tienes verificación en 2 pasos). En Microsoft 365 de empresa, el administrador debe tener activado \"SMTP autenticado\"." },
  yahoo: { label: "Yahoo", host: "smtp.mail.yahoo.com", port: 465, security: "ssl", help: "Crea una contraseña de aplicación en la seguridad de tu cuenta de Yahoo y ponla aquí." },
  ionos: { label: "IONOS (correo de tu dominio)", host: "smtp.ionos.com", port: 587, security: "tls", help: "Usa el correo completo y su contraseña de IONOS." },
  zoho: { label: "Zoho Mail", host: "smtp.zoho.com", port: 465, security: "ssl", help: "Usa tu correo de Zoho y su contraseña (o una contraseña de aplicación)." },
  otro: { label: "Otro (cPanel, Hostinger, GoDaddy, servidor propio...)", host: "", port: 587, security: "tls", help: "Pon los datos SMTP que te da tu proveedor de correo. Normalmente el servidor es mail.tudominio.com y el puerto 465 (SSL) o 587 (TLS)." },
};

export function SmtpForm({ current, defaultEmail, action }: { current: BrandSmtp | null; defaultEmail: string; action: (fd: FormData) => Promise<void> }) {
  const [provider, setProvider] = useState(current?.provider && PRESETS[current.provider] ? current.provider : "gmail");
  const preset = PRESETS[provider];
  const [host, setHost] = useState(current?.host ?? preset.host);
  const [port, setPort] = useState(String(current?.port ?? preset.port));
  const [security, setSecurity] = useState<string>(current?.security ?? preset.security);
  const pick = (p: string) => {
    setProvider(p);
    if (p !== "otro") {
      setHost(PRESETS[p].host);
      setPort(String(PRESETS[p].port));
      setSecurity(PRESETS[p].security);
    }
  };
  return (
    <form action={action} className="panel form" id="smtp" style={{ marginTop: 14 }}>
      <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 6 }}>Enviar desde mi propio correo</h2>
      <p className="hint" style={{ marginBottom: 10 }}>Los avisos a tus clientes salen desde tu correo (personal o de empresa). Si tu correo falla, salen desde nuestro servidor con tu nombre, para que tus clientes no se queden sin avisos.</p>
      <label>Tu proveedor de correo
        <select name="provider" value={provider} onChange={(e) => pick(e.target.value)}>
          {Object.entries(PRESETS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
        </select>
      </label>
      <p className="hint">{preset.help}</p>
      <label>Tu correo<input name="fromEmail" type="email" required defaultValue={current?.from_email ?? defaultEmail} /></label>
      <label>{provider === "gmail" || provider === "yahoo" ? "Contraseña de aplicación" : "Contraseña del correo"}
        <input name="password" type="password" autoComplete="new-password" placeholder={current?.has_password ? "Guardada. Déjala vacía para no cambiarla" : ""} />
      </label>
      <details open={provider === "otro"}>
        <summary className="hint" style={{ cursor: "pointer" }}>Datos del servidor (avanzado)</summary>
        <label>Servidor SMTP<input name="host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="mail.tudominio.com" required /></label>
        <label>Puerto<input name="port" value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" required /></label>
        <label>Seguridad
          <select name="security" value={security} onChange={(e) => setSecurity(e.target.value)}>
            <option value="tls">TLS / STARTTLS (587)</option>
            <option value="ssl">SSL (465)</option>
            <option value="">Ninguna</option>
          </select>
        </label>
        <label>Usuario (si es distinto del correo)<input name="username" defaultValue={current && current.username !== current.from_email ? current.username : ""} /></label>
      </details>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="enabled" defaultChecked={current ? current.enabled : true} style={{ width: "auto" }} /> Usar mi correo para enviar</label>
      <label>Enviar la prueba a<input name="testTo" type="email" defaultValue={defaultEmail} /></label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn dark" name="intent" value="save">Guardar</button>
        <button className="btn s" name="intent" value="test">Guardar y enviar prueba</button>
      </div>
    </form>
  );
}
