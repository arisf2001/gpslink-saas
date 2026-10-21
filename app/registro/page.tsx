import { prisma } from "@/lib/db";
import { TRIAL_DAYS } from "@/lib/config";

import { ensureDefaultPlans } from "@/lib/plans";
import { SiteNav } from "../site-nav";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegistroPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  await ensureDefaultPlans();
  const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { devices: "asc" }] });
  const options = plans.map((p) => ({
    id: p.id,
    label: `Hasta ${p.devices} equipos`,
  }));
  const selected = plans.find((p) => p.id === plan)?.id ?? plans.find((p) => p.highlighted)?.id ?? plans[0]?.id ?? "";

  return (
    <>
      <SiteNav />
      <div className="wrap">
        <div className="panel narrow">
          <h1 style={{ fontSize: 24, marginBottom: 6 }}>Crea tu plataforma de rastreo</h1>
          <p className="hint" style={{ fontSize: 15, marginBottom: 20 }}>{Math.round(TRIAL_DAYS / 30)} meses gratis, sin tarjeta.</p>
          <RegisterForm plans={options} planId={selected} />
        </div>
      </div>
    </>
  );
}
