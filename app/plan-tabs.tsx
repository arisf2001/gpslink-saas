import Link from "next/link";
import { publicMoney, type Lang } from "@/lib/lang";

export type PublicTier = { id: string; minDevices: number; maxDevices: number | null; priceCents: number; currency: string };

const T = {
  es: { free: (m: number) => `${m} meses gratis para probar, sin tarjeta. Después pagas solo los equipos que subes.`, best: "MEJOR PRECIO", devices: "equipos GPS", ask: "Consultar precio", per: "por equipo / año", month: null as ((p: string) => string) | null, inc: ["Plataforma web con tu marca, gratis", "App móvil con tu marca, gratis", "Todas las funciones incluidas"], start: "Empezar gratis", howH: "Cómo se cobra, sin sorpresas", how: ["Subes equipos cuando quieras. No pagas nada por adelantado.", "El último día del mes te enviamos la factura de los equipos que subiste. Tienes del 1 al 15 para pagar.", "El mes que no subes equipos, no pagas nada.", "Cada equipo se renueva al cumplir su año. Mientras más equipos tengas, mejor precio."], note: "Precios en pesos dominicanos (RD$), convertidos del precio en dólares." },
  en: { free: (m: number) => `${m} months free to try, no card. Then you pay only for the devices you add.`, best: "BEST PRICE", devices: "GPS devices", ask: "Ask for price", per: "per device / year", month: (p: string) => `That's ${p} per device per month`, inc: ["Web platform with your brand, free", "Mobile app with your brand, free", "Every feature included"], start: "Start free", howH: "How billing works, no surprises", how: ["Add devices whenever you want. Nothing to pay upfront.", "On the last day of the month we send you the invoice for the devices you added. You have from the 1st to the 15th to pay.", "If you don't add devices that month, you pay nothing.", "Each device renews on its anniversary. The more devices you have, the better the price."], note: "Prices in US dollars (USD)." },
};

export function PricingTiers({ tiers, trialMonths, lang = "es", rate = 60, showPrices = true }: { tiers: PublicTier[]; trialMonths: number; lang?: Lang; rate?: number; showPrices?: boolean }) {
  const t = T[lang];
  const money = (cents: number) => publicMoney(cents, lang, rate);
  return (
    <>
      <div className="free">{t.free(trialMonths)}</div>
      <div className="grid">
        {tiers.map((tier, i) => (
          <div key={tier.id} className={`card${i === tiers.length - 1 ? " pop" : ""}`}>
            {i === tiers.length - 1 && <span className="pill">{t.best}</span>}
            <div className="n">{tier.maxDevices ? `${tier.minDevices}–${tier.maxDevices}` : `${tier.minDevices}+`}</div>
            <div className="u">{t.devices}</div>
            <div className="pr">{showPrices && tier.priceCents > 0 ? <>{money(tier.priceCents)} <small>{t.per}</small></> : t.ask}</div>
            {t.month && <div className="eq">{showPrices && tier.priceCents > 0 ? t.month(money(Math.round(tier.priceCents / 12))) : "\u00a0"}</div>}
            <ul>
              {t.inc.map((x) => <li key={x}>{x}</li>)}
            </ul>
            <Link href="/registro" className={i === tiers.length - 1 ? "btn" : "btn s"}>{t.start}</Link>
          </div>
        ))}
      </div>
      <div className="how-pay">
        <b>{t.howH}</b>
        <ul>
          {t.how.map((x) => <li key={x}>{x}</li>)}
        </ul>
        {showPrices && <p className="hint" style={{ marginTop: 8 }}>{t.note}</p>}
      </div>
    </>
  );
}
