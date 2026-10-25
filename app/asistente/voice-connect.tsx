"use client";

import { useState } from "react";

// "Conectar con Gemini / Alexa": the customer links their account once from the web, the mobile app is not involved.
export function VoiceConnect({ geminiUrl, alexaUrl, color }: { geminiUrl: string | null; alexaUrl: string | null; color: string }) {
  const [open, setOpen] = useState<"gemini" | "alexa" | null>(null);
  const [copied, setCopied] = useState(false);
  const toggle = (v: "gemini" | "alexa") => setOpen((o) => (o === v ? null : v));
  return (
    <div className="panel" id="voz" style={{ maxWidth: 720, margin: "10px auto 0", padding: 14 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Pregúntale a tu asistente de voz</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {geminiUrl && <button className="btn sm" style={{ background: color, borderColor: color, color: "#fff" }} onClick={() => toggle("gemini")}>Conectar con Gemini</button>}
        <button className="btn sm" style={{ background: "#00a8e1", borderColor: "#00a8e1", color: "#fff" }} onClick={() => toggle("alexa")}>Conectar con Alexa</button>
      </div>
      {open === "gemini" && geminiUrl && (
        <div style={{ marginTop: 12, lineHeight: 1.5 }}>
          <ol style={{ paddingLeft: 18, margin: "0 0 8px" }}>
            <li>En la computadora, abre <a href="https://gemini.google.com" target="_blank" rel="noreferrer">gemini.google.com</a> → Ajustes → <b>Connected Apps</b> → <b>Add a custom app</b>.</li>
            <li>Pega esta dirección:
              <div style={{ display: "flex", gap: 6, margin: "6px 0" }}>
                <input readOnly value={geminiUrl} onFocus={(e) => e.target.select()} style={{ flex: 1, fontSize: 13 }} />
                <button className="btn sm s" onClick={() => navigator.clipboard?.writeText(geminiUrl).then(() => setCopied(true))}>{copied ? "Copiada" : "Copiar"}</button>
              </div>
            </li>
            <li>Pulsa Next y entra con el mismo correo y contraseña de esta plataforma.</li>
          </ol>
          <p className="hint" style={{ margin: 0 }}>Después pregúntale a Gemini (en el teléfono o la computadora), por ejemplo: “Where is my Toyota?”. Por ahora Google solo lo permite en inglés, en EE. UU. y con cuenta de Google personal. Gemini solo puede consultar; no apaga motores.</p>
        </div>
      )}
      {open === "alexa" && (
        <div style={{ marginTop: 12, lineHeight: 1.5 }}>
          {alexaUrl ? (
            <>
              <ol style={{ paddingLeft: 18, margin: "0 0 8px" }}>
                <li><a href={alexaUrl} target="_blank" rel="noreferrer"><b>Abre la skill en Amazon</b></a> y pulsa <b>Activar</b> (o búscala en la app de Alexa).</li>
                <li>Entra con el mismo correo y contraseña de esta plataforma.</li>
              </ol>
              <p className="hint" style={{ margin: 0 }}>Después di: “Alexa, pregúntale a GPS Link dónde está mi carro”. Alexa solo puede consultar; no apaga motores.</p>
            </>
          ) : (
            <p className="hint" style={{ margin: 0 }}>Muy pronto: la skill de Alexa está en revisión de Amazon.</p>
          )}
        </div>
      )}
    </div>
  );
}
