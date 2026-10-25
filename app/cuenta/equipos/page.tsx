import Link from "next/link";
import { requireTab } from "@/lib/tabs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { alertSetting, deviceStatuses, problems, type DeviceStatus } from "@/lib/device-status";
import { deviceList } from "@/lib/gpswox";
import { getSession } from "@/lib/session";
import { DeviceTable, sortByProblems } from "../../device-table";
import { SiteNav } from "../../site-nav";
import { CuentaNav } from "../cuenta-nav";

export const dynamic = "force-dynamic";

export default async function EquiposPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const companyId = await getSession("company");
  await requireTab("equipos");
  const company = companyId ? await prisma.company.findUnique({ where: { id: companyId } }) : null;
  if (!company) redirect("/cuenta");
  const { f = "todos" } = await searchParams;
  const setting = await alertSetting();
  const cfg = { lowBattery: setting.lowBattery, offlineHours: setting.offlineHours };
  const now = new Date();
  let all: DeviceStatus[] = [];
  let readError = false;
  try {
    all = company.gpswoxUserId ? await deviceStatuses((await deviceList(company.gpswoxUserId)).map((d) => d.id)) : [];
  } catch (e) {
    readError = true;
    console.error("[cuenta/equipos]", (e as Error).message);
  }
  const withProblems = all.filter((s) => s.lastReport && problems(s, now, cfg).length);
  const rows = sortByProblems(f === "problemas" ? withProblems : all, now, cfg);

  return (
    <>
      <SiteNav />
      <div className="wrap" style={{ maxWidth: 1060, paddingBottom: 40 }}>
        <h1 className="page-title">Mis equipos</h1>
        <CuentaNav active="equipos" />
        <p className="hint" style={{ marginBottom: 12 }}>
          El estado que manda cada GPS: batería, señal del teléfono, satélites, si está conectado a la corriente del vehículo y si el motor está bloqueado. Si conectaste tu WhatsApp en &quot;Mi WhatsApp&quot;, te avisamos por ahí cuando un equipo tiene la batería baja, se desconecta de la corriente o deja de reportar. Algunos modelos de GPS no mandan todos los datos.
        </p>
        {readError && <div className="err" style={{ marginBottom: 12 }}>No pudimos leer tus equipos de la plataforma de rastreo. Inténtalo en unos minutos.</div>}
        <div className="tabs" style={{ margin: "0 0 12px" }}>
          <Link href="/cuenta/equipos?f=todos" className={`tab${f === "todos" ? " on" : ""}`}>Todos ({all.length})</Link>
          <Link href="/cuenta/equipos?f=problemas" className={`tab${f === "problemas" ? " on" : ""}`}>Con problemas ({withProblems.length})</Link>
        </div>
        <div className="panel"><DeviceTable rows={rows} now={now} cfg={cfg} /></div>
      </div>
    </>
  );
}
