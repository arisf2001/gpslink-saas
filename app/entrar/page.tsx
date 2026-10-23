import { trackerUrl } from "@/lib/config";
import { SiteNav } from "../site-nav";
import { TrackLoginForm } from "./form";
import { getLang } from "@/lib/lang";
import { toEnglish } from "@/lib/i18n-errors";
import { brandForHost } from "@/lib/brand-host";
import { BrandEntrar } from "./brand-entrar";

export async function generateMetadata() {
  const brand = await brandForHost();
  return { title: `Entrar · ${brand ? brand.site.name || brand.company.name : "GPS Link"}` };
}

export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ gl_error?: string }> }) {
  const { gl_error } = await searchParams;
  const lang = await getLang();
  const err = gl_error ? (gl_error === "2" ? "Demasiados intentos. Espera un minuto." : "Correo o contraseña incorrectos.") : undefined;
  const brand = await brandForHost();
  if (brand) return <BrandEntrar brand={brand} error={err} />;
  return (
    <>
      <SiteNav path="/entrar" />
      <main className="wrap" style={{ maxWidth: 420, padding: "50px 20px" }}>
        <TrackLoginForm lang={lang} initialError={err && lang === "en" ? toEnglish(err) : err} googleUrl={`${trackerUrl()}/google/login`} />
      </main>
    </>
  );
}
