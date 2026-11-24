"use client";

import { useEffect, useRef, useState } from "react";

type Action = { type: string; label: string; url?: string; device_id?: number; from?: string; to?: string };
type Confirm = { token: string; command: string; device_id: number; device_name: string };
type Msg = { role: "user" | "assistant"; text: string; actions?: Action[] };
type Config = { enabled: boolean; assistant_name: string; brand_color: string; greeting: string; suggestions: string[]; has_pin: boolean };

type Panel = "admin" | "company" | undefined;

async function api<T>(path: string, body?: Record<string, unknown>, panel?: Panel): Promise<{ status: number; data: T & { message?: string } }> {
  const headers: Record<string, string> = panel ? { "x-panel": panel } : {};
  const res = await fetch(`/api/ia/v1/${path}`, body ? { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) } : { headers });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

// panel: the owner panel or a white label panel (their own login, admin tools); otherwise the customer web assistant.
export function AssistantChat({ panel, suggestions }: { panel?: Panel; suggestions?: string[] } = {}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversation, setConversation] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [pin, setPin] = useState("");
  const [pinPanel, setPinPanel] = useState(false);
  const [pinForm, setPinForm] = useState({ password: "", pin: "", msg: "" });
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<Config>("config", undefined, panel).then(({ status, data }) => {
      if (status !== 200) return setError(data.message ?? "No se pudo abrir el asistente.");
      setConfig(data);
      setMsgs([{ role: "assistant", text: data.greeting }]);
    });
  }, [panel]);
  // Block body: newer Chrome returns a Promise from scrollIntoView, and React would call it as the effect cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, confirm]);

  async function send(message: string) {
    if (!message.trim() || busy) return;
    setText("");
    setMsgs((m) => [...m, { role: "user", text: message }]);
    setBusy(true);
    const { status, data } = await api<{ conversation_id: string; reply: string; actions: Action[]; confirm: Confirm | null }>("chat", { message, conversation_id: conversation, lang: "es" }, panel);
    setBusy(false);
    if (status !== 200) return setMsgs((m) => [...m, { role: "assistant", text: data.message ?? "No pude responder, intenta otra vez." }]);
    setConversation(data.conversation_id);
    setMsgs((m) => [...m, { role: "assistant", text: data.reply, actions: data.actions }]);
    setConfirm(data.confirm);
    setPin("");
  }

  async function doConfirm() {
    if (!confirm) return;
    setBusy(true);
    const { data } = await api<{ ok: boolean; reply: string }>("confirm", { token: confirm.token, pin, lang: "es" }, panel);
    setBusy(false);
    setPin("");
    setMsgs((m) => [...m, { role: "assistant", text: data.reply ?? data.message ?? "" }]);
    if (data.ok || !/te quedan/i.test(data.reply ?? "")) setConfirm(null);
  }

  async function savePin() {
    const { data } = await api<{ ok: boolean; reply: string }>("pin", { password: pinForm.password, pin: pinForm.pin, lang: "es" }, panel);
    setPinForm({ password: "", pin: "", msg: data.reply ?? data.message ?? "" });
    if (data.ok) setConfig((c) => (c ? { ...c, has_pin: true } : c));
  }

  if (error) return <div className="panel narrow"><div className="err">{error}</div></div>;
  if (!config) return <div className="panel narrow">Cargando…</div>;
  if (!config.enabled) return <div className="panel narrow"><h1 style={{ fontSize: 20 }}>Asistente IA</h1><p className="hint">El asistente todavía no está activo para tu cuenta. Pídeselo a tu proveedor de rastreo.</p></div>;

  const color = config.brand_color;
  return (
    <div className="ia-box">
      <div className="ia-head" style={{ background: color }}>
        <strong>{config.assistant_name}</strong>
        <button className="ia-pinbtn" onClick={() => setPinPanel((v) => !v)}>{config.has_pin ? "Cambiar PIN" : "Crear PIN"}</button>
      </div>
      {pinPanel && (
        <div className="ia-pin">
          <p className="hint">El PIN (4 a 6 números) se pide para apagar o encender el motor. Para crearlo o cambiarlo confirma tu contraseña de la plataforma.</p>
          <input type="password" placeholder="Contraseña de la plataforma" value={pinForm.password} onChange={(e) => setPinForm({ ...pinForm, password: e.target.value })} autoComplete="current-password" />
          <input type="password" inputMode="numeric" placeholder="PIN nuevo" maxLength={6} value={pinForm.pin} onChange={(e) => setPinForm({ ...pinForm, pin: e.target.value.replace(/\D/g, "") })} autoComplete="off" />
          <button className="btn sm dark" onClick={savePin}>Guardar PIN</button>
          {pinForm.msg && <span className="hint">{pinForm.msg}</span>}
        </div>
      )}
      <div className="ia-msgs">
        {msgs.map((m, i) => (
          <div key={i} className={`ia-msg ${m.role}`}>
            <div className="ia-bubble" style={m.role === "user" ? { background: color } : undefined}>{m.text}</div>
            {!!m.actions?.length && (
              <div className="ia-actions">
                {m.actions.filter((a) => a.url).map((a, j) => <a key={j} href={a.url} target="_blank" rel="noreferrer" className="ia-chip">{a.label}</a>)}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="ia-msg assistant"><div className="ia-bubble ia-typing">Escribiendo…</div></div>}
        {confirm && (
          <div className="ia-confirm">
            <strong>{confirm.command === "engine_stop" ? "Apagar motor" : confirm.command === "zone_activate" ? "Activar zona roja" : "Encender motor"}: {confirm.device_name}</strong>
            <input type="password" inputMode="numeric" placeholder="Tu PIN" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} autoComplete="off" />
            <div className="row">
              <button className="btn sm red" disabled={busy || pin.length < 4} onClick={doConfirm}>Confirmar</button>
              <button className="btn sm s" onClick={() => setConfirm(null)}>Cancelar</button>
            </div>
          </div>
        )}
        <div ref={end} />
      </div>
      {msgs.length <= 1 && (
        <div className="ia-actions" style={{ padding: "0 14px" }}>
          {(suggestions ?? config.suggestions).map((s) => <button key={s} className="ia-chip" onClick={() => send(s)}>{s}</button>)}
        </div>
      )}
      {/* No <form>: if the page is not interactive yet, Enter must not reload it. */}
      <div className="ia-input">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }} placeholder="Escribe tu pregunta…" maxLength={1000} enterKeyHint="send" />
        <button type="button" className="btn sm" style={{ background: color }} disabled={busy || !text.trim()} onClick={() => send(text)}>Enviar</button>
      </div>
    </div>
  );
}
