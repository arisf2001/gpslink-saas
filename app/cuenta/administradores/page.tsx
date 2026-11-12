import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { accountLoginUrl, brandHasOwnLogin } from "@/lib/brand-host";
import { formatDate } from "@/lib/format";
import { getSession, getStaffId } from "@/lib/session";
import { SiteNav } from "../../site-nav";
import { CuentaNav } from "../cuenta-nav";
import { addAdminAction, deleteAdminAction, resetAdminAction, toggleAdminAction } from "./actions";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = {
  creado: "Listo. Le enviamos su usuario y contraseña por correo.",
  "creado-sin-correo": "Lo agregamos, pero no se pudo enviar el correo. Toca \"Nueva contraseña\" para intentar otra vez.",
  clave: "Le enviamos una contraseña nueva por correo.",
  "clave-sin-correo": "Cambiamos su contraseña, pero no se pudo enviar el correo. Intenta otra vez.",
  activado: "Administrador activado: ya puede entrar.",
  desactivado: "Administrador desactivado: ya no puede entrar.",
  quitado: "Administrador quitado.",
};
const ERR: Record<string, string> = {
  nombre: "Escribe su nombre.",
  correo: "Ese correo no es válido.",
  usado: "Ese correo ya tiene una cuenta. Usa otro.",
};

export default async function AdminsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const companyId = await getSession("company");
  if (!companyId || (await getStaffId())) redirect("/cuenta");
  const company = await prisma.company.findUnique({ where: { id: companyId }, include: { users: { orderBy: { createdAt: "asc" } } } });
  if (!company) redirect("/cuenta");
  const { ok, error } = await searchParams;
  const loginUrl = accountLoginUrl(company);
  return (
    <>
      <SiteNav />
      <div className="wrap" style={{ maxWidth: 860, paddingBottom: 40 }}>
        <h1 className="page-title">{company.name}</h1>
        <CuentaNav active="admins" />
        {ok && OK[ok] && <div className="ok" style={{ marginBottom: 12 }}>{OK[ok]}</div>}
        {error && ERR[error] && <div className="err" role="alert" style={{ marginBottom: 12 }}>{ERR[error]}</div>}

        <div className="panel">
          <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 10 }}>Tu link para entrar</h2>
          <a href={loginUrl} target="_blank" rel="noreferrer" style={{ color: "var(--p)", fontWeight: 700 }}>{loginUrl}</a>
          <p className="hint" style={{ marginTop: 6 }}>
            Tú y tus administradores entran aquí con su correo y su contraseña.
            {brandHasOwnLogin(company) ? "" : " Cuando conectemos tu dominio, van a entrar desde tu propia web (tudominio.com/entrar)."}
          </p>
        </div>

        <div className="panel" style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 10 }}>Agregar administrador</h2>
          <form action={addAdminAction} className="form">
            <label>Nombre<input name="name" required maxLength={80} /></label>
            <label>Correo<input name="email" type="email" required maxLength={200} /></label>
            <button className="btn">Agregar y enviarle su acceso</button>
          </form>
          <p className="hint" style={{ marginTop: 8 }}>Le llega por correo su usuario y su contraseña. Puede hacer todo en tu cuenta, menos agregar o quitar administradores y tocar la tarjeta de pago.</p>
        </div>

        <div className="panel" style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: 18, textAlign: "left", marginBottom: 10 }}>Administradores</h2>
          {company.users.length === 0 ? (
            <p className="hint">Todavía no has agregado administradores.</p>
          ) : (
            <table className="t">
              <thead><tr><th>Nombre</th><th>Correo</th><th>Estado</th><th>Última entrada</th><th></th></tr></thead>
              <tbody>
                {company.users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{u.active ? "Activo" : "Desactivado"}</td>
                    <td>{u.lastLoginAt ? formatDate(u.lastLoginAt) : "Nunca"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <form action={toggleAdminAction}><input type="hidden" name="id" value={u.id} /><button className="btn sm s">{u.active ? "Desactivar" : "Activar"}</button></form>
                        <form action={resetAdminAction}><input type="hidden" name="id" value={u.id} /><button className="btn sm s">Nueva contraseña</button></form>
                        <form action={deleteAdminAction}><input type="hidden" name="id" value={u.id} /><button className="btn sm s">Quitar</button></form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
