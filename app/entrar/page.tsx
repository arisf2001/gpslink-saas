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
      <main className="entrar">
        <video className="entrar-v" autoPlay muted loop playsInline preload="auto" poster="/hero.jpg" aria-hidden="true">
          <source src="/hero-m.mp4" type="video/mp4" media="(max-width: 900px)" />
          <source src="/hero.mp4" type="video/mp4" />
        </video>
        <div className="entrar-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-gpslink.png" alt="GPS Link" className="entrar-logo" />
          <TrackLoginForm lang={lang} initialError={err && lang === "en" ? toEnglish(err) : err} googleUrl={`${trackerUrl()}/google/login`} />
        </div>
      </main>
    </>
  );
}
