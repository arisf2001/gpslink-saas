import type { TicketMessage } from "@prisma/client";
import { mediaUrl } from "@/lib/site-media";

const when = (d: Date) => d.toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" });

export function TicketThread({ messages }: { messages: TicketMessage[] }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {messages.map((m) => (
        <div key={m.id} style={{ justifySelf: m.fromAdmin ? "start" : "end", maxWidth: "85%", background: m.fromAdmin ? "#eff6ff" : "#f1f5f9", border: "1px solid #e5e7eb", borderRadius: 12, padding: "10px 13px" }}>
          <div className="hint" style={{ marginBottom: 4 }}><b>{m.author}</b> · {when(m.createdAt)}</div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 14.5, lineHeight: 1.45 }}>{m.body}</div>
          {m.image && (
            <a href={mediaUrl(m.image)} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(m.image)} alt="Foto adjunta" style={{ marginTop: 8, maxWidth: 260, maxHeight: 260, borderRadius: 8, display: "block" }} />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

export const TICKET_ERR: Record<string, string> = {
  asunto: "Escribe el asunto (mínimo 3 letras).",
  mensaje: "Escribe el mensaje.",
  foto: "La foto debe ser una imagen (JPG, PNG, WEBP o GIF) de máximo 3 MB.",
  ticket: "Ese ticket no existe.",
};
