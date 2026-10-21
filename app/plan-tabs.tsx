import Link from "next/link";

export type PublicTier = { id: string; minDevices: number; maxDevices: number | null; priceCents: number; currency: string };

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

export function PricingTiers({ tiers, trialMonths }: { tiers: PublicTier[]; trialMonths: number }) {
  return (
    <>
      <div className="free">{trialMonths} meses gratis para probar, sin tarjeta. Después pagas solo los equipos que subes.</div>
      <div className="grid">
        {tiers.map((t, i) => (
          <div key={t.id} className={`card${i === tiers.length - 1 ? " pop" : ""}`}>
            {i === tiers.length - 1 && <span className="pill">MEJOR PRECIO</span>}
            <div className="n">{t.maxDevices ? `${t.minDevices}–${t.maxDevices}` : `${t.minDevices}+`}</div>
            <div className="u">equipos GPS</div>
            <div className="pr">{t.priceCents > 0 ? money(t.priceCents, t.currency) : "Consultar"} <small>por equipo / año</small></div>
            <div className="eq">{t.priceCents > 0 ? `Equivale a ${money(Math.round(t.priceCents / 12), t.currency)} por equipo al mes` : "\u00a0"}</div>
            <ul>
              <li>Plataforma web con tu marca, gratis</li>
              <li>App móvil con tu marca, gratis</li>
              <li>Todas las funciones incluidas</li>
            </ul>
            <Link href="/registro" className={i === tiers.length - 1 ? "btn" : "btn s"}>Empezar gratis</Link>
          </div>
        ))}
      </div>
      <div className="how-pay">
        <b>Cómo se cobra, sin sorpresas</b>
        <ul>
          <li>Subes equipos cuando quieras. No pagas nada por adelantado.</li>
          <li>El último día del mes te enviamos la factura de los equipos que subiste. Tienes del 1 al 15 para pagar.</li>
          <li>El mes que no subes equipos, no pagas nada.</li>
          <li>Cada equipo se renueva al cumplir su año. Mientras más equipos tengas, mejor precio.</li>
        </ul>
      </div>
    </>
  );
}
