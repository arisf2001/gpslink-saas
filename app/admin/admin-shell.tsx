import Link from "next/link";
import { adminLogoutAction } from "./actions";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="top">
        <div className="wrap">
          <Link href="/admin" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="" />
            GPS LINK · Admin
          </Link>
          <div className="admin-nav">
            <Link href="/admin">Empresas</Link>
            <Link href="/admin/planes">Precios</Link>
            <Link href="/admin/equipos">Equipos</Link>
            <Link href="/admin/sim">Tarjetas SIM</Link>
            <Link href="/admin/activacion">Activación</Link>
            <Link href="/admin/ia">Asistente IA</Link>
            <Link href="/admin/whatsapp">WhatsApp</Link>
            <form action={adminLogoutAction}><button className="btn sm s">Salir</button></form>
          </div>
        </div>
      </nav>
      <div className="wrap" style={{ paddingBottom: 40 }}>{children}</div>
    </>
  );
}
