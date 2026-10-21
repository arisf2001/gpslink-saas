import Link from "next/link";
import { prisma } from "@/lib/db";
import { TRIAL_DAYS } from "@/lib/config";
import { ensureDefaultPlans } from "@/lib/plans";
import { TrackLoginForm } from "./entrar/form";
import { SiteNav } from "./site-nav";
import { PricingTiers, type PublicTier } from "./plan-tabs";

export const dynamic = "force-dynamic";

const FEATURE_GROUPS = [
  {
    title: "Tu marca",
    items: [
      "Plataforma web con tu logo, colores y nombre, gratis (incluida en todos los paquetes)",
      "Tu propio subdominio (o tu dominio)",
      "App móvil para Android y iPhone con tu marca, gratis (incluida en todos los paquetes)",
      "Correos y avisos a tus clientes con tu nombre",
    ],
  },
  {
    title: "Tu negocio",
    items: [
      "Crea y administra a tus clientes",
      "Crea tus propios paquetes y precios, desde 1 equipo",
      "Cobra a tu manera: WhatsApp, Azul, depósito o efectivo",
      "Crea dealers y subdistribuidores con su propia marca",
      "Usuarios con permisos para tu equipo de trabajo",
      "Fecha de vencimiento por cliente y por equipo",
    ],
  },
  {
    title: "Rastreo para tus clientes",
    items: [
      "Ubicación en tiempo real en el mapa",
      "Historial y reproducción de rutas",
      "Alertas de velocidad, encendido, geocercas y SOS",
      "Geocercas y puntos de interés",
      "Apagado y encendido de motor a distancia",
      "Reportes de kilómetros, paradas, viajes y horas de motor",
      "Sensores de combustible, temperatura y más",
      "Compatible con GT06 y cientos de modelos de GPS",
    ],
  },
  {
    title: "Nosotros nos encargamos",
    items: [
      "Servidores, seguridad y mantenimiento",
      "Soporte técnico de GPS Link",
      "Bloques de 10 equipos cuando necesites crecer",
      "Pagas a fin de mes solo los equipos que subiste",
    ],
  },
];

export default async function Home() {
  await ensureDefaultPlans();
  const tierRows = await prisma.priceTier.findMany({ orderBy: { minDevices: "asc" } });
  const tiers: PublicTier[] = tierRows.map((t, i) => ({ id: t.id, minDevices: t.minDevices, maxDevices: tierRows[i + 1] ? tierRows[i + 1].minDevices - 1 : null, priceCents: t.priceCents, currency: t.currency }));
  const months = Math.round(TRIAL_DAYS / 30);

  return (
    <>
      <SiteNav />
      <div className="hero">
        <div className="wrap">
          <div className="t">
            <div className="badge">{months} meses gratis · sin tarjeta</div>
            <h1>
              Tu propia plataforma de rastreo GPS <span>con tu marca</span>
            </h1>
            <p>Vende rastreo satelital con tu nombre, tu logo y tu app. Nosotros ponemos los servidores; tú pones los clientes.</p>
            <ul>
              <li>Plataforma web con tu marca, gratis</li>
              <li>App móvil con tu marca, gratis</li>
              <li>Vende paquetes desde 1 equipo</li>
              <li>Crea dealers con su propia marca</li>
              <li>Cobra a tus clientes a tu manera</li>
              <li>Apagado de motor, alertas e historial</li>
            </ul>
            <Link href="#planes" className="btn">Empezar {months} meses gratis</Link>
            &nbsp;&nbsp;
            <Link href="#como-funciona" className="btn o">Cómo funciona</Link>
            <TrackLoginForm compact />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ph" src="/phone.png" alt="App de rastreo GPS" />
        </div>
      </div>

      <section id="planes">
        <div className="wrap">
          <h2>Planes</h2>
          <div className="sub">Pagas por equipo al año. Mientras más equipos, mejor precio.</div>
          <PricingTiers tiers={tiers} trialMonths={months} />
        </div>
      </section>

      <section className="feats" id="funciones">
        <div className="wrap">
          <h2>Todo lo que puedes hacer con tu marca blanca</h2>
          <div className="sub">Todos los paquetes incluyen todas las funciones. Solo cambia la cantidad de equipos.</div>
          <div className="fgrid">
            {FEATURE_GROUPS.map((g) => (
              <div key={g.title} className="fcard">
                <b>{g.title}</b>
                <ul>{g.items.map((i) => <li key={i}>{i}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="appshow">
        <div className="wrap appshow-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/app-gpslink.jpg" alt="App de rastreo GPS con mapa, velocidad y vista de la calle" width={720} height={624} />
          <div>
            <h2>App móvil con tu marca, gratis</h2>
            <p>Tus clientes ven sus vehículos en tiempo real desde Android y iPhone, con el logo y los colores de tu empresa.</p>
            <ul>
              <li>Ubicación en vivo en el mapa</li>
              <li>Velocidad al instante</li>
              <li>Vista de la calle con Google Maps</li>
              <li>Historial de rutas, alertas y apagado de motor</li>
            </ul>
            <a href="/registro" className="btn">Empezar gratis</a>
          </div>
        </div>
      </section>

      <section className="how" id="como-funciona">
        <div className="wrap">
          <h2>Cómo funciona</h2>
          <div className="steps">
            <div className="st"><div className="c">1</div><b>Regístrate gratis</b><span>Sin tarjeta. Empiezas tus {months} meses de prueba.</span></div>
            <div className="st"><div className="c">2</div><b>Pon tu marca</b><span>Subes tu logo y colores en tu plataforma.</span></div>
            <div className="st"><div className="c">3</div><b>Vende a tus clientes</b><span>Creas tus paquetes, cobras a tu manera y conectas sus GPS.</span></div>
            <div className="st"><div className="c">4</div><b>Crece con dealers</b><span>Tus dealers venden con su propia marca usando tus equipos.</span></div>
          </div>
          <div className="chain">
            <div className="lv"><b>GPS Link</b><span>te vende el paquete</span></div><div className="ar">→</div>
            <div className="lv"><b>Tu marca blanca</b><span>tu bolsa de equipos</span></div><div className="ar">→</div>
            <div className="lv"><b>Tus dealers</b><span>con su propia marca</span></div><div className="ar">→</div>
            <div className="lv"><b>Clientes finales</b><span>usan la app</span></div>
          </div>
        </div>
      </section>

      <div className="cta">
        <h2>Empieza hoy tu negocio de rastreo GPS</h2>
        <p>{months} meses gratis. Te avisamos 3, 2 y 1 día antes de terminar.</p>
        <Link href="#planes" className="btn">Crear mi cuenta gratis</Link>
      </div>
      <footer>© {new Date().getFullYear()} GPS Link USA</footer>
    </>
  );
}
