import { redirect } from "next/navigation";
import { requireTab } from "@/lib/tabs";
import { brandMail, type BrandMail } from "@/lib/brand-mail";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { SiteNav } from "../../site-nav";
import { CuentaNav } from "../cuenta-nav";
import { saveBrandMailAction, testBrandMailAction } from "./actions";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = { guardado: "Guardado. Los próximos correos a tus clientes ya salen así." };
const ERR: Record<string, string> = {
  correo: "Escribe un correo válido.",
  plataforma: "No se pudo conectar con la plataforma de rastreo. Intenta otra vez en un minuto.",
  envio: "La plataforma no pudo enviar el correo de prueba.",
  "sin-usuario": "Tu marca todavía no tiene usuario en la plataforma de rastreo.",
};

export default async function CorreoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const companyId = await getSession("company");
  await requireTab("correo");
  if (!companyId) redirect("/cuenta");
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) redirect("/cuenta");
  const q = await searchParams;
  const current: BrandMail | null = company.gpswoxUserId ? await brandMail(company.gpswoxUserId).catch(() => null) : null;
  const okMsg = q.ok === "prueba" ? `Correo de prueba enviado a ${q.to}. Revisa también la carpeta de spam.` : q.ok ? OK[q.ok] : null;
  const errMsg = q.error ? ERR[q.error] : !current && company.gpswoxUserId ? ERR.plataforma : null;

  return (
    <>
      <SiteNav />
      <div className="wrap" style={{ maxWidth: 960, paddingBottom: 40 }}>
        <CuentaNav active="correo" />
        {okMsg && <div className="ok" style={{ marginBottom: 12 }}>{okMsg}</div>}
        {errMsg && <div className="err" style={{ marginBottom: 12 }}>{errMsg}</div>}
        <form action={saveBrandMailAction} className="panel form">
          <h1 style={{ fontSize: 22, marginBottom: 6 }}>Mi correo</h1>
          <p className="hint" style={{ marginBottom: 12 }}>
            Las alertas, reportes y avisos que la plataforma manda por correo a tus clientes salen con el nombre de tu marca.
            Cuando un cliente responde, la respuesta te llega a tu correo.
          </p>
          <label>Nombre que verán tus clientes<input name="fromName" defaultValue={current?.from_name || company.name} maxLength={80} /></label>
          <label>Tu correo (aquí te llegan las respuestas)<input name="replyTo" type="email" defaultValue={current?.reply_to ?? ""} placeholder={company.email} /></label>
          {current && <p className="hint">Tus clientes lo verán así: <b>{current.from_name || company.name}</b> &lt;{current.from_email}&gt;. La dirección de envío es la del servidor, para que los correos no caigan en spam.</p>}
          <button className="btn dark">Guardar</button>
        </form>
        <form action={testBrandMailAction} className="panel form" style={{ marginTop: 14 }}>
          <b>Enviar un correo de prueba</b>
          <label>Enviar a<input name="testTo" type="email" defaultValue={company.email} /></label>
          <button className="btn sm s">Enviar prueba</button>
        </form>
      </div>
    </>
  );
}
