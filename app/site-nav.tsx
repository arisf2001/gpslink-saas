import Link from "next/link";
import { BRAND } from "@/lib/config";
import { getLang } from "@/lib/lang";
import { brandForHost } from "@/lib/brand-host";
import { mediaUrl } from "@/lib/site-media";

// `path` turns on the English/Español switch (public pages only).
export async function SiteNav({ path }: { path?: string } = {}) {
  const brand = await brandForHost();
  if (brand) {
    const color = /^#[0-9a-f]{3,8}$/i.test(brand.site.primary) ? brand.site.primary : "#0F4C5C";
    const name = brand.site.name || brand.company.name;
    const accent = /^#[0-9a-f]{3,8}$/i.test(brand.site.secondary) ? brand.site.secondary : "#22c55e";
    return (
      <>
        <style>{`:root{--p:${color};--pd:${color};--g:${accent};--gd:${accent}}`}</style>
        <nav className="top">
          <div className="wrap">
            {/* "/" on a brand domain is its public website, served outside Next. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {brand.site.logo ? <img src={mediaUrl(brand.site.logo)} alt={name} style={{ height: 38, width: "auto", maxWidth: 200 }} /> : name}
            </a>
            <div className="links">
              <a href="/entrar" style={{ fontWeight: 700, color: "var(--p)" }}>Entrar</a>
              <a href="/cuenta" style={{ fontWeight: 700, color: "var(--p)" }}>Mi cuenta</a>
            </div>
          </div>
        </nav>
      </>
    );
  }
  const en = (await getLang()) === "en";
  const wa = `https://wa.me/${BRAND.supportWhatsApp.replace(/\D/g, "")}?text=${encodeURIComponent(en ? "Hi, I want information about the GPS Link white label" : "Hola, quiero información sobre la marca blanca de GPS Link")}`;
  return (
    <>
    <nav className="top">
      <div className="wrap">
        <Link href="/" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="" />
          GPS LINK
        </Link>
        <div className="links">
          <Link href="/#funciones" className="hide-m">{en ? "Features" : "Funciones"}</Link>
          <Link href="/#como-funciona" className="hide-m">{en ? "How it works" : "Cómo funciona"}</Link>
          <Link href="/#planes" className="hide-m">{en ? "Plans" : "Planes"}</Link>
          <Link href="/entrar" style={{ fontWeight: 700, color: "var(--p)" }}>{en ? "Sign in to tracking" : "Entrar a la plataforma"}</Link>
          <Link href="/cuenta" style={{ fontWeight: 700, color: "var(--p)" }}>{en ? "My account" : "Mi cuenta"}</Link>
          {path && <a href={`/idioma?l=${en ? "es" : "en"}&next=${encodeURIComponent(path)}`} className="lang-sw" aria-label={en ? "Cambiar a español" : "Switch to English"}>{en ? "ES" : "EN"}</a>}
          <Link href="/#planes" className="btn">{en ? "Free trial" : "Prueba gratis"}</Link>
        </div>
      </div>
    </nav>
    <a href={wa} className="wa-float" target="_blank" rel="noreferrer" aria-label={en ? "Message us on WhatsApp" : "Escríbenos por WhatsApp"}>
      <svg viewBox="0 0 32 32" width="30" height="30" fill="#fff" aria-hidden="true"><path d="M16 3C9 3 3.3 8.6 3.3 15.6c0 2.5.7 4.8 2 6.8L3 29l6.8-2.2c1.9 1.1 4 1.6 6.2 1.6 7 0 12.7-5.6 12.7-12.6S23 3 16 3zm0 23.1c-2 0-3.9-.6-5.6-1.6l-.4-.2-4 1.3 1.3-3.9-.3-.4c-1.1-1.7-1.7-3.7-1.7-5.7C5.3 9.8 10.1 5 16 5s10.7 4.8 10.7 10.6S21.9 26.1 16 26.1zm5.9-7.9c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.2-.2-.3 0-.5.1-.7l.5-.6c.2-.2.2-.4.3-.6.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.2 1.4 3.5c.2.2 2.4 3.6 5.7 5 .8.3 1.4.5 1.9.7.8.3 1.5.2 2.1.1.6-.1 1.9-.8 2.2-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4z"/></svg>
    </a>
    </>
  );
}
