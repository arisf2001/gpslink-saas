import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDate, formatMoney, METHOD_LABELS } from "@/lib/format";
import { ghlConfig } from "@/lib/ghl";
import { checkGhlInvoice, invoiceUrl } from "@/lib/manual-invoices";
import { getSession } from "@/lib/session";
import { AdminShell } from "../admin-shell";
import { createInvoiceAction, markPaidAction, sendInvoiceAction, voidInvoiceAction } from "./actions";

export const dynamic = "force-dynamic";

const defaultDue = () => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

const STATUS: Record<string, string> = { OPEN: "Pendiente", PAID: "Pagada", VOID: "Anulada" };

export default async function AdminInvoicesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  if (!(await getSession("admin"))) redirect("/admin");
  const { ok, error } = await searchParams;
  const [companies, invoices] = await Promise.all([
    prisma.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
    prisma.manualInvoice.findMany({ orderBy: { number: "desc" }, take: 200 }),
  ]);
  for (const inv of invoices) {
    if (inv.provider !== "ghl" || inv.status !== "OPEN") continue;
    const paid = await checkGhlInvoice(inv).catch(() => null);
    if (paid) Object.assign(inv, paid);
  }
  const due = defaultDue();
  const ghl = !!ghlConfig();

  return (
    <AdminShell>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Facturas</h1>
      {ok && <div className="ok" style={{ marginBottom: 12 }}>{ok}</div>}
      {error && <div className="err" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Nueva factura</h2>
        <form action={createInvoiceAction} className="form" style={{ display: "grid", gap: 10 }}>
          <label>Empresa (opcional)
            <select name="companyId" defaultValue="">
              <option value="">— Otro cliente (escribe sus datos) —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.email}</option>)}
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
            <label>Nombre del cliente<input name="name" placeholder="Si escogiste empresa, puedes dejarlo vacío" /></label>
            <label>Correo<input name="email" type="email" placeholder="cliente@correo.com" /></label>
            <label>Teléfono<input name="phone" placeholder="Opcional" /></label>
          </div>
          <table className="table" style={{ width: "100%" }}>
            <thead><tr><th style={{ textAlign: "left" }}>Descripción</th><th style={{ width: 90 }}>Cantidad</th><th style={{ width: 150 }}>Precio unitario</th></tr></thead>
            <tbody>
              {[0, 1, 2, 3, 4].map((i) => (
                <tr key={i}><td><input name="desc" placeholder={i === 0 ? "Ej.: GPS + instalación" : ""} /></td><td><input name="qty" defaultValue="1" inputMode="decimal" /></td><td><input name="price" placeholder="0.00" inputMode="decimal" /></td></tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
            <label>Moneda<select name="currency" defaultValue="usd"><option value="usd">US$ (dólares)</option><option value="dop">RD$ (pesos)</option></select></label>
            <label>Cobrar por<select name="provider" defaultValue={ghl ? "ghl" : "stripe"}>{ghl && <option value="ghl">GHL (solo US$)</option>}<option value="stripe">Stripe</option></select></label>
            <label>Vence<input name="dueAt" type="date" defaultValue={due} /></label>
          </div>
          <label>Nota (opcional)<textarea name="note" rows={2} placeholder="Ej.: Gracias por preferirnos." /></label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="send" defaultChecked style={{ width: "auto" }} /> Enviar por correo al crearla</label>
          <button className="btn" style={{ justifySelf: "start" }}>Crear factura</button>
        </form>
      </div>

      <div className="panel" style={{ padding: 20, overflowX: "auto" }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Facturas creadas</h2>
        {invoices.length === 0 ? <p className="hint">Todavía no has creado facturas.</p> : (
          <table className="table" style={{ width: "100%" }}>
            <thead><tr><th>#</th><th style={{ textAlign: "left" }}>Cliente</th><th style={{ textAlign: "right" }}>Total</th><th>Vence</th><th>Estado</th><th style={{ textAlign: "left" }}>Acciones</th></tr></thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{String(inv.number).padStart(4, "0")}</td>
                  <td>{inv.name}<br /><span className="hint">{inv.email}</span></td>
                  <td style={{ textAlign: "right" }}>{formatMoney(inv.totalCents, inv.currency)}</td>
                  <td>{formatDate(inv.dueAt)}<br /><span className="hint">{inv.provider === "ghl" ? "GHL" : "Stripe"}</span></td>
                  <td>{STATUS[inv.status] ?? inv.status}{inv.status === "PAID" && inv.method ? <><br /><span className="hint">{METHOD_LABELS[inv.method] ?? inv.method}</span></> : null}{inv.sentAt ? <><br /><span className="hint">Enviada {formatDate(inv.sentAt)}</span></> : null}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <a href={invoiceUrl(inv.token)} target="_blank" rel="noreferrer">Ver / enlace</a>
                      {inv.status !== "VOID" && <form action={sendInvoiceAction}><input type="hidden" name="id" value={inv.id} /><button className="btn" style={{ padding: "4px 10px" }}>Reenviar correo</button></form>}
                      {inv.status === "OPEN" && (
                        <form action={markPaidAction} style={{ display: "flex", gap: 4 }}>
                          <input type="hidden" name="id" value={inv.id} />
                          <select name="method" defaultValue="deposito" style={{ width: "auto" }}><option value="deposito">Transferencia</option><option value="efectivo">Efectivo</option><option value="azul">Azul</option><option value="manual">Otro</option></select>
                          <button className="btn" style={{ padding: "4px 10px" }}>Marcar pagada</button>
                        </form>
                      )}
                      {inv.status === "OPEN" && <form action={voidInvoiceAction}><input type="hidden" name="id" value={inv.id} /><button className="btn" style={{ padding: "4px 10px", background: "#b91c1c" }}>Anular</button></form>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}
