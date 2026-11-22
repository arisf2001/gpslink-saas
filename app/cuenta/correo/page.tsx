import { redirect } from "next/navigation";
import { requireTab } from "@/lib/tabs";
import { brandMail, type BrandMail } from "@/lib/brand-mail";
import { prisma } from "@/lib/db";
import { TEMPLATE_LABELS } from "@/lib/mail-templates-es";
import { getSession } from "@/lib/session";
import { siteFor } from "@/lib/site";
import { SiteNav } from "../../site-nav";
import { CuentaNav } from "../cuenta-nav";
import { removeSmtpAction, saveBrandMailAction, saveLayoutAction, saveSmtpAction, saveTemplateAction, spanishTemplatesAction, testBrandMailAction } from "./actions";
import { SmtpForm } from "./smtp-form";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = {
  guardado: "Guardado. Los próximos correos a tus clientes ya salen así.",
  smtp: "Guardado. Los avisos a tus clientes saldrán desde tu correo.",
  "smtp-quitado": "Listo. Los avisos vuelven a salir desde nuestro servidor con tu nombre.",
  diseno: "Diseño guardado.",
  espanol: "Listo: todas las plantillas quedaron en español con tu marca y tu link.",
  plantilla: "Plantilla guardada.",
};
const ERR: Record<string, string> = {
  correo: "Escribe un correo válido.",
  servidor: "Revisa el servidor SMTP y el puerto.",
  plataforma: "No se pudo conectar con la plataforma de rastreo. Intenta otra vez en un minuto.",
  envio: "La plataforma no pudo enviar el correo de prueba.",
  "smtp-envio": "Tu correo no dejó enviar. Revisa el correo, la contraseña y los datos del servidor.",
  plantilla: "La plantilla necesita asunto y texto.",
  "sin-usuario": "Tu marca todavía no tiene usuario en la plataforma de rastreo.",
};

export default async function CorreoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const companyId = await getSession("company");
  await requireTab("correo");
  if (!companyId) redirect("/cuenta");
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) redirect("/cuenta");
  const q = await searchParams;
  const current: BrandMail | null = company.gpswoxUserId ? await brandMail(company.gpswoxUserId, { templates: true }).catch(() => null) : null;
  const okMsg = q.ok === "prueba" || q.ok === "smtp-prueba" ? `Correo de prueba enviado a ${q.to}${q.ok === "smtp-prueba" ? " desde tu correo" : ""}. Revisa también la carpeta de spam.` : q.ok ? OK[q.ok] : null;
  const errMsg = q.error ? ERR[q.error] : !current && company.gpswoxUserId ? ERR.plataforma : null;
  const smtp = current?.smtp ?? null;
  const status = current?.smtp_status;
  const layout = current?.layout;
  const site = siteFor(company);
  const templates = (current?.templates ?? []).filter((t) => TEMPLATE_LABELS[t.name]);

  return (
    <>
      <SiteNav />
      <div className="wrap" style={{ maxWidth: 960, paddingBottom: 40 }}>
        <CuentaNav active="correo" />
        {okMsg && <div className="ok" style={{ marginBottom: 12 }}>{okMsg}</div>}
        {errMsg && <div className="err" style={{ marginBottom: 12 }}>{errMsg}{q.msg ? <div className="hint" style={{ marginTop: 6 }}>Respuesta del servidor: {q.msg}</div> : null}</div>}
        <form action={saveBrandMailAction} className="panel form">
          <h1 style={{ fontSize: 22, marginBottom: 6 }}>Mi correo</h1>
          <p className="hint" style={{ marginBottom: 12 }}>
            Las alertas, reportes y avisos que la plataforma manda por correo a tus clientes salen con el nombre de tu marca.
            Cuando un cliente responde, la respuesta te llega a tu correo.
          </p>
          <label>Nombre que verán tus clientes<input name="fromName" defaultValue={current?.from_name || company.name} maxLength={80} /></label>
          <label>Tu correo (aquí te llegan las respuestas)<input name="replyTo" type="email" defaultValue={current?.reply_to ?? ""} placeholder={company.email} /></label>
          {current && <p className="hint">Tus clientes lo verán así: <b>{current.from_name || company.name}</b> &lt;{smtp?.enabled ? smtp.from_email : current.from_email}&gt;.</p>}
          <button className="btn dark">Guardar</button>
        </form>

        <SmtpForm current={smtp} defaultEmail={current?.reply_to || company.email} action={saveSmtpAction} />
        {smtp && (
          <div className="panel" style={{ marginTop: 8 }}>
            <p className="hint">
              {smtp.enabled ? <>Ahora los avisos salen desde <b>{smtp.from_email}</b> ({smtp.host}).</> : <>Tu correo está guardado pero apagado: los avisos salen desde nuestro servidor.</>}
              {status && <> Último envío: {status.ok ? "funcionó" : <b style={{ color: "#b91c1c" }}>falló ({status.error})</b>}, {new Date(status.at * 1000).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" })}.</>}
            </p>
            <form action={removeSmtpAction}><button className="btn sm">Quitar mi correo</button></form>
          </div>
        )}

        <form action={saveLayoutAction} className="panel form" id="diseno" style={{ marginTop: 14 }}>
          <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 6 }}>Diseño de los correos</h2>
          <p className="hint">Pone arriba de cada correo una franja con tu logo y tu color, y abajo tu pie de página. El logo es el de &quot;Mi web&quot;{site.logo ? "" : " (todavía no tienes logo: se pone el nombre de tu marca)"}.</p>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="enabled" defaultChecked={layout?.enabled ?? false} style={{ width: "auto" }} /> Usar este diseño</label>
          <label>Color de la franja<input name="color" type="color" defaultValue={layout?.color || company.brandColor || "#0F4C5C"} style={{ height: 40 }} /></label>
          <label>Pie de página (por ejemplo, teléfono, dirección o redes)<textarea name="footer" rows={3} maxLength={500} defaultValue={layout?.footer ?? `© ${company.name}`} /></label>
          <button className="btn dark">Guardar diseño</button>
        </form>

        <div className="panel" id="plantillas" style={{ marginTop: 14 }}>
          <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 6 }}>Plantillas de los correos</h2>
          <p className="hint" style={{ marginBottom: 10 }}>
            Cambia el asunto y el texto de cada correo que reciben tus clientes. Las palabras entre corchetes, como [device.name] o [speed], se cambian solas por los datos reales.
          </p>
          <form action={spanishTemplatesAction} style={{ marginBottom: 12 }}>
            <button className="btn s">Poner todas en español con mi marca y mi link</button>
          </form>
          {templates.map((t) => (
            <details key={t.name} id={`t-${t.name}`} style={{ borderTop: "1px solid #e5e7eb", padding: "8px 0" }}>
              <summary style={{ cursor: "pointer" }}><b>{TEMPLATE_LABELS[t.name]}</b> <span className="hint">{t.custom ? "· personalizada" : "· original (inglés)"}</span></summary>
              <form action={saveTemplateAction} className="form" style={{ marginTop: 8 }}>
                <input type="hidden" name="name" value={t.name} />
                <label>Asunto<input name="title" defaultValue={t.title} maxLength={250} /></label>
                <label>Texto (HTML)<textarea name="note" rows={8} defaultValue={t.note} style={{ fontFamily: "monospace", fontSize: 13 }} /></label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn dark sm" name="intent" value="save">Guardar</button>
                  {t.custom && <button className="btn sm" name="intent" value="reset">Volver a la original</button>}
                </div>
              </form>
            </details>
          ))}
        </div>

        <form action={testBrandMailAction} className="panel form" style={{ marginTop: 14 }}>
          <b>Enviar un correo de prueba</b>
          <label>Enviar a<input name="testTo" type="email" defaultValue={company.email} /></label>
          <button className="btn sm s">Enviar prueba</button>
        </form>
      </div>
    </>
  );
}
