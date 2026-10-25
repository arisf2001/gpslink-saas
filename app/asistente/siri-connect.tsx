import { resolveUser } from "@/lib/ai/assistant";
import { appUrl } from "@/lib/config";
import { siriToken } from "@/lib/siri";
import { siriKeyAction } from "./actions";

// "Siri (iPhone)": personal key + steps to build the Shortcut that sends the question to /api/siri and speaks the reply.
export async function SiriConnect({ hash, embed }: { hash: string; embed: boolean }) {
  const user = await resolveUser(hash).catch(() => null);
  if (!user) return null;
  const token = await siriToken(user.userId);
  const url = token ? `${appUrl()}/api/siri?k=${token}` : null;
  return (
    <div className="panel" id="siri" style={{ maxWidth: 720, margin: "10px auto 0", padding: 14, lineHeight: 1.5 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Siri (iPhone y CarPlay)</div>
      <p className="hint" style={{ margin: "0 0 8px" }}>Dices “Oye Siri, GPS Link”, haces tu pregunta y Siri te contesta en voz alta. Solo consulta; no apaga motores.</p>
      {url ? (
        <>
          <div style={{ fontSize: 13, marginBottom: 4 }}>Tu dirección personal para Siri (no la compartas):</div>
          <input readOnly value={url} style={{ width: "100%", fontSize: 13, marginBottom: 8 }} />
          <ol style={{ paddingLeft: 18, margin: "0 0 8px" }}>
            <li>En el iPhone abre la app <b>Atajos</b> → <b>+</b> (nuevo atajo) y ponle de nombre <b>GPS Link</b>.</li>
            <li>Agrega la acción <b>Dictar texto</b>.</li>
            <li>Agrega <b>Obtener contenido de URL</b>: pega tu dirección de arriba. Toca la flecha → Método <b>POST</b> → Cuerpo de solicitud <b>JSON</b> → campo de texto <b>q</b> con el valor <b>Texto dictado</b>.</li>
            <li>Agrega <b>Leer texto</b> (o <b>Mostrar resultado</b>) con el <b>Contenido de URL</b>.</li>
            <li>Listo: di “Oye Siri, GPS Link” y pregunta, por ejemplo, “¿dónde está la jeepeta?”.</li>
          </ol>
        </>
      ) : (
        <p style={{ margin: "0 0 8px" }}>Primero crea tu clave personal para Siri.</p>
      )}
      <form action={siriKeyAction}>
        <input type="hidden" name="embed" value={embed ? "1" : ""} />
        <button className="btn sm">{url ? "Cambiar clave (la anterior deja de funcionar)" : "Crear mi clave para Siri"}</button>
      </form>
    </div>
  );
}
