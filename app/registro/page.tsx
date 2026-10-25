import { TRIAL_DAYS } from "@/lib/config";

import { ensureDefaultPlans, signupPlans } from "@/lib/plans";
import { SiteNav } from "../site-nav";
import { RegisterForm } from "./register-form";
import { getLang } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function RegistroPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  await ensureDefaultPlans();
  const lang = await getLang();
  const en = lang === "en";
  const plans = await signupPlans();
  const options = plans.map((p) => ({
    id: p.id,
    label: en ? `Up to ${p.devices} devices` : `Hasta ${p.devices} equipos`,
  }));
  const selected = plans.find((p) => p.id === plan)?.id ?? plans.find((p) => p.highlighted)?.id ?? plans[0]?.id ?? "";

  return (
    <>
      <SiteNav path="/registro" />
      <div className="wrap">
        <div className="panel narrow">
          <h1 style={{ fontSize: 24, marginBottom: 6 }}>{en ? "Create your tracking platform" : "Crea tu plataforma de rastreo"}</h1>
          <p className="hint" style={{ fontSize: 15, marginBottom: 20 }}>{en ? `${Math.round(TRIAL_DAYS / 30)} months free, no card.` : `${Math.round(TRIAL_DAYS / 30)} meses gratis, sin tarjeta.`}</p>
          <RegisterForm plans={options} planId={selected} lang={lang} />
        </div>
      </div>
    </>
  );
}
