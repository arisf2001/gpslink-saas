import { redirect } from "next/navigation";
import { brandOrigin, brandRootDomain, loginSnippet } from "@/lib/brand-web";
import { trackerUrl } from "@/lib/config";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { SiteNav } from "../../site-nav";
import { CuentaNav } from "../cuenta-nav";
import { SubdomainForm, WebsiteForm } from "./website-form";

export const dynamic = "force-dynamic";

export default async function MiWebPage() {
  const companyId = await getSession("company");
  if (!companyId) redirect("/cuenta");
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) redirect("/cuenta");
  const platform = company.subdomain ? brandOrigin(company.subdomain) : trackerUrl();
  const snippet = loginSnippet(company.slug, company.brandColor ?? "#0F4C5C", platform);

  return (
    <>
      <SiteNav />
      <div className="wrap">
        <CuentaNav active="web" />
        <div className="panel">
          <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 6 }}>Tu plataforma con tu nombre</h2>
          <p className="hint" style={{ marginBottom: 12 }}>Tus clientes entran a tu plataforma de rastreo en esta dirección, ven tu marca y se quedan ahí. Cuando tengas tu propio dominio, pídenos conectarlo.</p>
          <SubdomainForm current={company.subdomain ?? ""} root={brandRootDomain()} />
          {company.subdomain && <p style={{ marginTop: 10 }}>Tu plataforma: <a href={`${platform}/login`} target="_blank" rel="noreferrer" style={{ color: "var(--p)", fontWeight: 700 }}>{platform}</a></p>}
        </div>
        <div className="panel" style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 6 }}>Tu web</h2>
          <p className="hint" style={{ marginBottom: 12 }}>Cuando tus clientes cierren sesión en la plataforma, vuelven a esta dirección. Si la dejas vacía, vuelven a la entrada de tu plataforma.</p>
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
