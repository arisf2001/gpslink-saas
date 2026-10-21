import { redirect } from "next/navigation";
import { loginSnippet } from "@/lib/brand-web";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { SiteNav } from "../../site-nav";
import { CuentaNav } from "../cuenta-nav";
import { WebsiteForm } from "./website-form";

export const dynamic = "force-dynamic";

export default async function MiWebPage() {
  const companyId = await getSession("company");
  if (!companyId) redirect("/cuenta");
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) redirect("/cuenta");
  const snippet = loginSnippet(company.slug, company.brandColor ?? "#0F4C5C");

  return (
    <>
      <SiteNav />
      <div className="wrap">
        <CuentaNav active="web" />
        <div className="panel">
          <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 6 }}>Tu web</h2>
          <p className="hint" style={{ marginBottom: 12 }}>Cuando tus clientes cierren sesión en la plataforma, vuelven a esta dirección. Si la dejas vacía, vuelven a tu pantalla de entrada con tu logo.</p>
          <WebsiteForm current={company.websiteUrl ?? ""} />
        </div>
        <div className="panel" style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 6 }}>Recuadro para entrar desde tu web</h2>
          <p className="hint" style={{ marginBottom: 12 }}>Copia este código y pégalo en tu web (en WordPress, en un bloque &quot;HTML personalizado&quot;). Tus clientes entran con su correo y contraseña, o con Google, y pasan directo a su plataforma.</p>
          <textarea readOnly value={snippet} rows={14} style={{ width: "100%", fontFamily: "monospace", fontSize: 12, padding: 10, border: "1.5px solid #d1d5db", borderRadius: 10 }} />
        </div>
      </div>
    </>
  );
}
