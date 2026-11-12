import type { HostBrand } from "@/lib/brand-host";
import { companyPlatformOrigin } from "@/lib/brand-web";
import { SiteNav } from "../site-nav";
import { LoginForm } from "../cuenta/login-form";
import { TrackLoginForm } from "./form";

// /entrar on a white label's own domain: its tracking platform and its account, with no GPS Link branding.
export function BrandEntrar({ brand, error }: { brand: HostBrand; error?: string }) {
  const name = brand.site.name || brand.company.name;
  return (
    <>
      <SiteNav />
      <main className="wrap" style={{ maxWidth: 880, padding: "40px 20px", display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", alignItems: "start" }}>
        <TrackLoginForm initialError={error} googleUrl={`${companyPlatformOrigin(brand.company)}/google/login`} />
        <div className="panel" style={{ margin: 0 }}>
          <b style={{ fontSize: 18 }}>Administrar {name}</b>
          <p className="hint" style={{ margin: "4px 0 14px" }}>Para el dueño y los administradores de la cuenta.</p>
          <LoginForm brand />
        </div>
      </main>
    </>
  );
}
