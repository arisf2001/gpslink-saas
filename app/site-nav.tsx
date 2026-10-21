import Link from "next/link";
import { BRAND } from "@/lib/config";

export function SiteNav() {
  const wa = `https://wa.me/${BRAND.supportWhatsApp.replace(/\D/g, "")}?text=${encodeURIComponent("Hola, quiero información sobre la marca blanca de GPS Link")}`;
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
          <Link href="/#funciones" className="hide-m">Funciones</Link>
          <Link href="/#como-funciona" className="hide-m">Cómo funciona</Link>
          <Link href="/#planes" className="hide-m">Planes</Link>
          <Link href="/entrar" style={{ fontWeight: 700, color: "var(--p)" }}>Entrar a la plataforma</Link>
          <Link href="/cuenta" style={{ fontWeight: 700, color: "var(--p)" }}>Mi cuenta</Link>
          <Link href="/#planes" className="btn">Prueba gratis</Link>
        </div>
      </div>
    </nav>
    <a href={wa} className="wa-float" target="_blank" rel="noreferrer" aria-label="Escríbenos por WhatsApp">
      <svg viewBox="0 0 32 32" width="30" height="30" fill="#fff" aria-hidden="true"><path d="M16 3C9 3 3.3 8.6 3.3 15.6c0 2.5.7 4.8 2 6.8L3 29l6.8-2.2c1.9 1.1 4 1.6 6.2 1.6 7 0 12.7-5.6 12.7-12.6S23 3 16 3zm0 23.1c-2 0-3.9-.6-5.6-1.6l-.4-.2-4 1.3 1.3-3.9-.3-.4c-1.1-1.7-1.7-3.7-1.7-5.7C5.3 9.8 10.1 5 16 5s10.7 4.8 10.7 10.6S21.9 26.1 16 26.1zm5.9-7.9c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.2-.2-.3 0-.5.1-.7l.5-.6c.2-.2.2-.4.3-.6.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.2 1.4 3.5c.2.2 2.4 3.6 5.7 5 .8.3 1.4.5 1.9.7.8.3 1.5.2 2.1.1.6-.1 1.9-.8 2.2-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4z"/></svg>
    </a>
    </>
  );
}
