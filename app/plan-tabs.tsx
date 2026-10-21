"use client";

import Link from "next/link";
import { useState } from "react";

export type PublicPlan = {
  id: string;
  category: string;
  devices: number;
  name: string;
  priceCents: number;
  currency: string;
  features: string[];
  highlighted: boolean;
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

export type BlockPrice = { priceCents: number; currency: string };

export function PlanTabs({ plans, labels, trialMonths, blockPrices }: { plans: PublicPlan[]; labels: Record<string, string>; trialMonths: number; blockPrices: Record<string, BlockPrice> }) {
  const categories = Object.keys(labels).filter((c) => plans.some((p) => p.category === c));
  const [active, setActive] = useState(categories[0]);
  const visible = plans.filter((p) => p.category === active);
  const block = blockPrices[active];

  return (
    <>
      {categories.length > 1 && (
      <div className="tabs" role="tablist">
        {categories.map((c) => (
          <button key={c} type="button" role="tab" aria-selected={c === active} className={`tab${c === active ? " on" : ""}`} onClick={() => setActive(c)}>
            {labels[c]}
          </button>
        ))}
      </div>
      )}
      <div className="free">{trialMonths} meses gratis para probar, sin tarjeta. Después eliges tu paquete.</div>
      <div className="grid">
        {visible.map((p) => (
          <div key={p.id} className={`card${p.highlighted ? " pop" : ""}`}>
            {p.highlighted && <span className="pill">MÁS VENDIDO</span>}
            <div className="n">{p.devices}</div>
            <div className="u">equipos GPS</div>
            {p.priceCents > 0 ? (
              <>
                <div className="pr">{money(p.priceCents, p.currency)} <small>/año</small></div>
                <div className="eq">Equivale a {money(Math.round(p.priceCents / p.devices / 12), p.currency)} por equipo al mes</div>
              </>
            ) : (
              <>
                <div className="pr">Consultar <small>/año</small></div>
                <div className="eq">&nbsp;</div>
              </>
            )}
            <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
            <Link href={`/registro?plan=${p.id}`} className={p.highlighted ? "btn" : "btn s"}>Empezar gratis</Link>
          </div>
        ))}
      </div>
      <p className="sub" style={{ marginTop: 22, textAlign: "center" }}>
        Cada equipo cuenta su año desde el día en que lo agregas. ¿Necesitas más? Agrega bloques de 10 equipos{block && block.priceCents > 0 ? ` por ${money(block.priceCents, block.currency)} al año` : ""}.
      </p>
    </>
  );
}
