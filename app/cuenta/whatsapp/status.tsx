"use client";

import { useEffect, useState } from "react";

type State = { want: boolean; status: string; phone: string | null; error: string | null; workerUp: boolean; qr: string | null };

const COMPANY_CONNECTED = "El asistente ya responde a tus clientes y los avisos de cobro salen por aquí.";

export function WhatsAppStatus({ initial, endpoint = "/api/cuenta/whatsapp", connectedText = COMPANY_CONNECTED }: { initial: State; endpoint?: string; connectedText?: string }) {
  const [s, setS] = useState(initial);
  useEffect(() => {
    if (!s.want || s.status === "CONNECTED") return;
    const id = setInterval(() => fetch(endpoint).then((r) => r.json()).then(setS).catch(() => {}), 3000);
    return () => clearInterval(id);
  }, [s.want, s.status, endpoint]);

  if (s.status === "CONNECTED") return <div className="ok">Conectado al número +{s.phone}. {connectedText}</div>;
  if (!s.want) return s.error ? <div className="err">{s.error}</div> : null;
  if (s.qr)
    return (
      <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={s.qr} alt="Código QR de WhatsApp" width={280} height={280} />
        <p className="hint">En el teléfono: WhatsApp → Ajustes → Dispositivos vinculados → Vincular un dispositivo, y escanea este código.</p>
      </div>
    );
  return <p className="hint">{s.workerUp ? "Preparando el código QR…" : "El servicio de WhatsApp está arrancando, espera unos segundos…"}</p>;
}
