"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void> };
type State = "off" | "on" | "denied" | "unsupported" | "busy";

function keyBytes(base64: string) {
  const raw = atob((base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const post = (body: unknown) => fetch("/api/admin/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

// Installs the owner panel as a PC app and turns on its desktop notifications.
export function PushButton({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("busy");
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const onPrompt = (e: Event) => (e.preventDefault(), setInstall(e as InstallEvent));
    window.addEventListener("beforeinstallprompt", onPrompt);
    if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      Promise.resolve().then(() => setState("unsupported"));
    } else {
      navigator.serviceWorker
        .register("/admin-sw.js", { scope: "/admin", updateViaCache: "none" })
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setState(Notification.permission === "denied" ? "denied" : sub ? "on" : "off"))
        .catch(() => setState("unsupported"));
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [publicKey]);

  async function turnOn() {
    setState("busy");
    setNote("");
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      await post({ subscription: sub.toJSON() });
      setState("on");
      const r = await post({ test: true });
      setNote(r.ok ? "Listo: te mandé un aviso de prueba." : "No pude mandar el aviso de prueba.");
    } catch {
      setState("off");
      setNote("No se pudieron activar los avisos.");
    }
  }

  async function test() {
    const r = await post({ test: true });
    setNote(r.ok ? "Aviso de prueba enviado." : "No pude mandar el aviso de prueba.");
  }

  return (
    <span className="push-ctl">
      {install && (
        <button type="button" className="btn sm s" onClick={() => install.prompt().then(() => setInstall(null))}>
          Instalar en la PC
        </button>
      )}
      {state === "off" && (
        <button type="button" className="btn sm s" onClick={turnOn}>
          Activar avisos
        </button>
      )}
      {state === "on" && (
        <button type="button" className="btn sm s" onClick={test} title="Mandar un aviso de prueba">
          Avisos activos
        </button>
      )}
      {state === "denied" && <span className="hint" title="En Chrome: candado de la barra de direcciones → Notificaciones → Permitir">Avisos bloqueados en este navegador</span>}
      {note && <span className="hint">{note}</span>}
    </span>
  );
}
