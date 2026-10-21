import { redirect } from "next/navigation";
import { appUrl } from "@/lib/config";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { metaSetting } from "@/lib/meta";
import { getSession } from "@/lib/session";
import { OWNER_WA } from "@/lib/wa";
import { WhatsAppStatus } from "../../cuenta/whatsapp/status";
import { AdminShell } from "../admin-shell";
import { connectOwnerWaAction, disconnectOwnerWaAction, saveMetaAction, sendMetaAction, sendOwnerWaAction, testMetaAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminWhatsAppPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  if (!(await getSession("admin"))) redirect("/admin");
  const { ok, error } = await searchParams;
  const s = await metaSetting();
  const [logs, qr, outbox] = await Promise.all([
    prisma.metaLog.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.waSession.findUnique({ where: { companyId: OWNER_WA } }),
    prisma.waOutbox.findMany({ where: { companyId: OWNER_WA }, orderBy: { id: "desc" }, take: 15 }),
  ]);
  const qrInitial = { want: qr?.want ?? false, status: qr?.status ?? "OFF", phone: qr?.phone ?? null, error: qr?.error ?? null, workerUp: true, qr: null };
  const webhook = `${appUrl()}/api/meta/webhook`;

  return (
    <AdminShell>
      <h1 className="page-title">WhatsApp de GPS Link</h1>
      {ok && <div className="ok" style={{ margin: "10px 0" }}>{ok}</div>}
      {error && <div className="err" style={{ margin: "10px 0" }}>{error}</div>}

      <div className="panel" id="qr" style={{ margin: "14px 0" }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Tu número por QR (solo envía avisos)</h2>
        <p className="hint" style={{ marginBottom: 10 }}>
          Conecta tu WhatsApp con un código QR, como WhatsApp Web. Si el WhatsApp de Meta no está activo, por este número salen las facturas y avisos de cobro a tus marcas blancas, la bienvenida de los registros nuevos y los avisos de tus equipos. No contesta a nadie: los mensajes que te lleguen los respondes tú desde el teléfono.
        </p>
        <div className="err" style={{ marginBottom: 12, background: "#fffbeb", borderColor: "#fcd34d", color: "#92400e" }}>
          Importante: esta conexión no es la oficial de Meta. Si WhatsApp detecta muchos mensajes automáticos puede bloquear el número. Usa un número solo para el negocio, no el personal.
        </div>
        <WhatsAppStatus key={`${qrInitial.want}-${qrInitial.status}`} initial={qrInitial} endpoint="/api/admin/whatsapp" connectedText={s.enabled ? "Meta está activo, así que los avisos salen por Meta; este número queda de respaldo." : "Los avisos y facturas salen por este número."} />
        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          {!qr?.want ? (
            <form action={connectOwnerWaAction}><button className="btn dark">Conectar WhatsApp</button></form>
          ) : (
            <form action={disconnectOwnerWaAction}><button className="btn sm red">Desconectar</button></form>
          )}
        </div>
        {qr?.status === "CONNECTED" && (
          <form action={sendOwnerWaAction} className="form" style={{ maxWidth: 620, marginTop: 14 }}>
            <label>Mensaje de prueba: número (con código de país)<input name="phone" required placeholder="18095551234" inputMode="tel" /></label>
            <label>Mensaje<textarea name="text" required rows={2} /></label>
            <button className="btn sm dark">Enviar por mi WhatsApp QR</button>
          </form>
        )}
        {outbox.length > 0 && (
          <table className="t" style={{ marginTop: 14 }}>
            <thead><tr><th>Fecha</th><th>Número</th><th>Mensaje</th><th>Estado</th></tr></thead>
            <tbody>
              {outbox.map((o) => (
                <tr key={o.id}>
                  <td>{formatDate(o.createdAt)}</td>
                  <td>+{o.phone}</td>
                  <td style={{ whiteSpace: "pre-wrap", maxWidth: 420 }}>{o.text.slice(0, 200)}</td>
                  <td>{o.status === "sent" ? "Enviado" : o.status === "pending" ? "En cola" : <span style={{ color: "#b91c1c" }}>{o.error}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel" style={{ margin: "14px 0" }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Conexión</h2>
        <p className="hint" style={{ marginBottom: 10 }}>
          Por este número salen las facturas y avisos a tus marcas blancas, y se atiende a quien escribe: los interesados en la marca blanca reciben la información y el registro, y tus clientes directos pueden consultar sus vehículos con la IA (si la activas en “Asistente IA”).
        </p>
        <form action={saveMetaAction} className="form" style={{ maxWidth: 620 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="enabled" defaultChecked={s.enabled} style={{ width: "auto" }} /> Activar el WhatsApp de Meta</label>
          <label>Phone number ID<input name="phoneNumberId" defaultValue={s.phoneNumberId ?? ""} inputMode="numeric" /></label>
          <label>WhatsApp Business Account ID<input name="wabaId" defaultValue={s.wabaId ?? ""} inputMode="numeric" /></label>
          <label>Token de acceso permanente (System User)<input name="token" type="password" autoComplete="off" placeholder={s.tokenSealed ? "Guardado. Déjalo vacío para no cambiarlo" : "EAA..."} /></label>
          <label>App secret (para verificar los mensajes que llegan)<input name="appSecret" type="password" autoComplete="off" placeholder={s.appSecretSealed ? "Guardado. Déjalo vacío para no cambiarlo" : ""} /></label>
          <label>Plantilla aprobada para avisos (con una sola variable {"{{1}}"})<input name="template" defaultValue={s.template ?? ""} placeholder="aviso_gpslink" /></label>
          <div className="row" style={{ gap: 10 }}>
            <label style={{ flex: 1 }}>Idioma de la plantilla<input name="templateLang" defaultValue={s.templateLang} /></label>
            <label style={{ flex: 1 }}>Versión de la API<input name="graphVersion" defaultValue={s.graphVersion} /></label>
          </div>
          <button className="btn sm dark">Guardar</button>
        </form>
        <form action={testMetaAction} style={{ marginTop: 10 }}><button className="btn sm">Probar conexión</button></form>
      </div>

      <div className="panel" style={{ margin: "14px 0" }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Webhook (se pega en Meta)</h2>
        <p className="hint">En Meta for Developers → tu app → WhatsApp → Configuración → Webhook. Suscribe el campo <b>messages</b>.</p>
        <table className="t" style={{ marginTop: 8 }}>
          <tbody>
            <tr><td>URL de devolución de llamada</td><td><code>{webhook}</code></td></tr>
            <tr><td>Token de verificación</td><td><code>{s.verifyToken}</code></td></tr>
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ margin: "14px 0" }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Enviar un mensaje</h2>
        <p className="hint" style={{ marginBottom: 8 }}>Meta solo deja mandar texto libre si la persona te escribió en las últimas 24 horas. Si no, marca “usar la plantilla”.</p>
        <form action={sendMetaAction} className="form" style={{ maxWidth: 620 }}>
          <label>Número (con código de país)<input name="phone" required placeholder="18095551234" inputMode="tel" /></label>
          <label>Mensaje<textarea name="text" required rows={3} /></label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="template" style={{ width: "auto" }} /> Usar la plantilla</label>
          <button className="btn sm dark">Enviar</button>
        </form>
      </div>

      <div className="panel" style={{ margin: "14px 0" }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Últimos mensajes</h2>
        <table className="t">
          <thead><tr><th>Fecha</th><th></th><th>Número</th><th>Mensaje</th><th>Estado</th></tr></thead>
          <tbody>
            {logs.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)" }}>Todavía no hay mensajes.</td></tr>}
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{formatDate(l.createdAt)}</td>
                <td>{l.direction === "in" ? "Recibido" : "Enviado"}</td>
                <td>+{l.phone}</td>
                <td style={{ whiteSpace: "pre-wrap", maxWidth: 420 }}>{l.text.slice(0, 300)}</td>
                <td>{l.ok ? "OK" : <span style={{ color: "#b91c1c" }}>{l.error}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
