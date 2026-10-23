import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isPermSet, permMapFromSet, platformPerms, type PermsResult } from "@/lib/perms";
import { getSession } from "@/lib/session";
import { requireTab } from "@/lib/tabs";
import { PermsTable } from "../../perms-table";
import { SiteNav } from "../../site-nav";
import { CuentaNav } from "../cuenta-nav";
import { saveClientPermsAction } from "./actions";

export const dynamic = "force-dynamic";

const ERR: Record<string, string> = {
  plataforma: "No se pudo conectar con la plataforma de rastreo. Intenta de nuevo en un momento.",
  "sin-usuario": "Tu cuenta todavía no tiene usuario en la plataforma de rastreo.",
};

export default async function PermisosPage({ searchParams }: { searchParams: Promise<{ cliente?: string; ok?: string; error?: string; n?: string }> }) {
  const companyId = await getSession("company");
  if (!companyId) redirect("/cuenta");
  await requireTab("permisos");
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) redirect("/cuenta");
  const { cliente, ok, error, n } = await searchParams;
  const client = cliente ? await prisma.endClient.findFirst({ where: { id: cliente, companyId } }) : null;
  const data: PermsResult | null = company.gpswoxUserId
    ? await platformPerms(company.gpswoxUserId, client ? { kind: "client", id: client.gpswoxUserId } : { kind: "clients" }).catch(() => null)
    : null;
  const current = client ? (data?.current ?? {}) : isPermSet(company.clientPerms) ? permMapFromSet(company.clientPerms) : (data?.available ?? {});
  const okText = ok === "cliente" ? "Guardado: este cliente ya ve solo lo marcado." : ok === "todos" ? `Guardado y aplicado a ${n ?? 0} ${n === "1" ? "cliente" : "clientes"}.` : ok === "guardado" ? "Guardado. Se aplicará a los clientes nuevos." : null;

  return (
    <>
      <SiteNav />
      <div className="wrap" style={{ maxWidth: 960, paddingBottom: 40 }}>
        <CuentaNav active="permisos" />
        {okText && <div className="ok" style={{ marginBottom: 12 }}>{okText}</div>}
        {error && ERR[error] && <div className="err" style={{ marginBottom: 12 }}>{ERR[error]}</div>}
        <form action={saveClientPermsAction} className="panel form">
          <h2 style={{ fontSize: 18, textAlign: "left", margin: 0 }}>{client ? `Qué ve ${client.email}` : "Qué ven mis clientes"}</h2>
          {client && <p style={{ margin: 0 }}><Link href={`/cuenta/clientes/${client.id}`}>← Volver al cliente</Link> · <Link href="/cuenta/permisos">Ver lo de todos los clientes</Link></p>}
          <p className="hint" style={{ margin: 0 }}>
            Marca lo que tus clientes pueden ver y usar en tu plataforma de rastreo. Lo que sale en gris no está incluido en tu cuenta.
            {client ? " Esto cambia solo a este cliente." : " Se aplica solo a los clientes nuevos que se registren, salvo que marques la casilla de abajo."}
          </p>
          {!data && <div className="err">No se pudo leer la plataforma de rastreo. Intenta de nuevo en un momento.</div>}
          {data && (
            <>
              {client && <input type="hidden" name="clientId" value={client.id} />}
              <PermsTable available={data.available} current={current} />
              {!client && <label style={{ flexDirection: "row", alignItems: "center", gap: 8, display: "flex" }}><input type="checkbox" name="applyAll" defaultChecked style={{ width: 18, height: 18 }} /> Aplicar también a mis {data.clients} clientes actuales</label>}
              <button className="btn" style={{ justifySelf: "start" }}>Guardar</button>
            </>
          )}
        </form>
      </div>
    </>
  );
}
