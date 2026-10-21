import Link from "next/link";

export function SiteNav() {
  return (
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
          <Link href="/cuenta" style={{ fontWeight: 700, color: "var(--p)" }}>Mi cuenta</Link>
          <Link href="/#planes" className="btn">Prueba gratis</Link>
        </div>
      </div>
    </nav>
  );
}
