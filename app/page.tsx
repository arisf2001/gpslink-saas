import { trackerUrl } from "@/lib/config";
import Link from "next/link";
import { Fragment } from "react";
import { dopRate, getLang, showPublicPrices } from "@/lib/lang";
import { prisma } from "@/lib/db";
import { TRIAL_DAYS } from "@/lib/config";
import { ensureDefaultPlans } from "@/lib/plans";
import { TrackLoginForm } from "./entrar/form";
import { SiteNav } from "./site-nav";
import { PricingTiers, type PublicTier } from "./plan-tabs";

export const dynamic = "force-dynamic";

const T = {
  es: {
    groups: [
      { title: "Tu marca", items: ["Plataforma web con tu logo, colores y nombre, gratis (incluida en todos los paquetes)", "Tu propio subdominio (o tu dominio)", "App móvil para Android y iPhone con tu marca, gratis (incluida en todos los paquetes)", "Página web de tu marca, editable: textos, productos y preguntas", "Correos a tus clientes desde tu propio correo, con plantillas a tu gusto", "App para la computadora con avisos en pantalla"] },
      { title: "Tu negocio", items: ["Crea y administra a tus clientes", "Crea tus propios paquetes y precios, desde 1 equipo", "Cobra a tu manera: WhatsApp, Azul, depósito o efectivo", "Crea dealers y subdistribuidores con su propia marca, clientes y equipos", "Tú decides qué ve cada dealer y cada cliente", "Usuarios con permisos para tu equipo de trabajo", "Activación de equipos paso a paso (GT06, SinoTrack y más)"] },
      { title: "Rastreo para tus clientes", items: ["Ubicación en tiempo real en el mapa", "Seguimiento en vivo suave, con el vehículo siempre en el centro", "Historial ajustado a la calle, con colores por velocidad", "Alertas de velocidad, encendido, geocercas y SOS", "Geocercas y puntos de interés", "Apagado y encendido de motor a distancia", "Reportes de kilómetros, paradas, viajes y horas de motor", "Sensores de combustible, temperatura y más", "Zonas fronterizas con aviso y corte de motor", "Compatible con GT06 y cientos de modelos de GPS"] },
      { title: "Pagos y vencimientos", items: ["Paga tu plan con tarjeta guardada y cobro automático", "Avisos 3, 2 y 1 día antes del vencimiento", "Bloqueo al vencer y reactivación automática al pagar", "Fecha de vencimiento por cliente y por equipo"] },
      { title: "Control de SIM", items: ["Cada SIM enlazada a su equipo", "Aviso cuando a una SIM le quedan pocos datos", "Alerta de posible cambio de SIM", "Recordatorio y pago en línea de la SIM antes de vencer"] },
      { title: "Nosotros nos encargamos", items: ["Servidores, seguridad y mantenimiento", "Soporte técnico de GPS Link", "Bloques de 10 equipos cuando necesites crecer", "Pagas a fin de mes solo los equipos que subiste"] },
    ],
    badge: (m: number) => `${m} meses gratis · sin tarjeta`,
    h1a: "Tu propia plataforma de rastreo GPS ", h1b: "con tu marca",
    lead: "Vende rastreo satelital con tu nombre, tu logo y tu app. Nosotros ponemos los servidores; tú pones los clientes.",
    heroList: ["Plataforma web con tu marca, gratis", "App móvil con tu marca, gratis", "Vende paquetes desde 1 equipo", "Crea dealers con su propia marca", "Cobra a tus clientes a tu manera", "Apagado de motor, alertas e historial", "Asistente IA por WhatsApp y voz"],
    start: (m: number) => `Empezar ${m} meses gratis`, how: "Cómo funciona",
    tags: [["Encendido", "Sí"], ["Velocidad", "68 km/h"], ["Zona", "Dentro de \"Almacén\""], ["Batería", "100%"], ["Combustible", "32%"], ["Último reporte", "Hace 5 s"], ["Motor", "No bloqueado"], ["Horas de motor", "4 h 6 min"]],
    aiH: "Asistente con inteligencia artificial",
    aiP: "Tus clientes preguntan por sus vehículos como si hablaran con una persona, y la IA contesta con los datos reales del GPS.",
    aiList: [["WhatsApp", "Escriben o mandan una nota de voz, y la IA contesta igual, con el link del mapa. Reconoce a cada cliente por su número."], ["Dice el lugar exacto", "«Dentro de tu zona Casa», «en el parqueo de la Plaza Central», «en la escuela San José»."], ["Siri y CarPlay", "Preguntan manos libres desde el iPhone y el carro."], ["Alexa y Google Home", "Preguntan desde la bocina de su casa."]] as [string, string][],
    soon: "Próximamente", aiSoon: 3,
    chat: [["u", "¿Dónde está la camioneta?"], ["b", "Tu Explorer está dentro de la zona Casa, en Santo Domingo. Está detenida, con el motor apagado. Último reporte: hace 1 minuto."], ["u", "voz"], ["b", "voz"], ["m", "Ver en el mapa"]] as [string, string][],
    chatName: "Asistente GPS Link", chatOn: "en línea",
    plans: "Planes", plansSub: "Pagas por equipo al año. Mientras más equipos, mejor precio.",
    featsH: "Todo lo que puedes hacer con tu marca blanca", featsSub: "Todos los paquetes incluyen todas las funciones. Solo cambia la cantidad de equipos.",
    appAlt: "App de rastreo GPS con mapa, velocidad y vista de la calle", appH: "App móvil con tu marca, gratis",
    appP: "Tus clientes ven sus vehículos en tiempo real desde Android y iPhone, con el logo y los colores de tu empresa.",
    appList: ["Ubicación en vivo en el mapa", "Velocidad al instante", "Vista de la calle con Google Maps", "Historial de rutas, alertas y apagado de motor"],
    startFree: "Empezar gratis",
    steps: [["Regístrate gratis", (m: number) => `Sin tarjeta. Empiezas tus ${m} meses de prueba.`], ["Pon tu marca", () => "Subes tu logo y colores en tu plataforma."], ["Vende a tus clientes", () => "Creas tus paquetes, cobras a tu manera y conectas sus GPS."], ["Crece con dealers", () => "Tus dealers venden con su propia marca usando tus equipos."]] as [string, (m: number) => string][],
    chain: [["GPS Link", "te vende el paquete"], ["Tu marca blanca", "tu bolsa de equipos"], ["Tus dealers", "con su propia marca"], ["Clientes finales", "usan la app"]],
    ctaH: "Empieza hoy tu negocio de rastreo GPS", ctaP: (m: number) => `${m} meses gratis. Te avisamos 3, 2 y 1 día antes de terminar.`, ctaBtn: "Crear mi cuenta gratis",
  },
  en: {
    groups: [
      { title: "Your brand", items: ["Web platform with your logo, colors and name, free (included in every package)", "Your own subdomain (or your domain)", "Android and iPhone app with your brand, free (included in every package)", "Your brand's own website, editable: texts, products and FAQ", "Emails to your clients from your own email, with your own templates", "Desktop app with on-screen notifications"] },
      { title: "Your business", items: ["Create and manage your clients", "Create your own packages and prices, from 1 device", "Charge your way: WhatsApp, card, bank deposit or cash", "Create dealers and sub-distributors with their own brand, clients and devices", "You decide what each dealer and client can see", "Users with permissions for your team", "Step-by-step device activation (GT06, SinoTrack and more)"] },
      { title: "Tracking for your clients", items: ["Real-time location on the map", "Smooth live follow, with the vehicle always centered", "Route history snapped to the road, colored by speed", "Speed, ignition, geofence and SOS alerts", "Geofences and points of interest", "Remote engine stop and start", "Mileage, stops, trips and engine-hours reports", "Fuel, temperature and other sensors", "Border zones with alerts and engine stop", "Works with GT06 and hundreds of GPS models"] },
      { title: "Payments and expiration", items: ["Pay your plan with a saved card and automatic billing", "Reminders 3, 2 and 1 day before expiration", "Blocked when expired, reactivated automatically on payment", "Expiration date per client and per device"] },
      { title: "SIM control", items: ["Each SIM linked to its device", "Alert when a SIM is running low on data", "Possible SIM swap alert", "SIM renewal reminder and online payment"] },
      { title: "We take care of", items: ["Servers, security and maintenance", "GPS Link technical support", "Blocks of 10 devices when you need to grow", "At the end of the month you pay only for the devices you added"] },
    ],
    badge: (m: number) => `${m} months free · no card`,
    h1a: "Your own GPS tracking platform ", h1b: "with your brand",
    lead: "Sell satellite tracking under your name, your logo and your app. We run the servers; you bring the clients.",
    heroList: ["Web platform with your brand, free", "Mobile app with your brand, free", "Sell packages from 1 device", "Create dealers with their own brand", "Charge your clients your way", "Engine stop, alerts and history", "AI assistant on WhatsApp and voice"],
    start: (m: number) => `Start ${m} months free`, how: "How it works",
    tags: [["Ignition", "On"], ["Speed", "42 mph"], ["Geofence", "Inside \"Warehouse\""], ["Battery", "100%"], ["Fuel", "32%"], ["Last report", "5 s ago"], ["Engine", "Not blocked"], ["Engine hours", "4 h 6 min"]],
    aiH: "Artificial intelligence assistant",
    aiP: "Your clients ask about their vehicles as if they were talking to a person, and the AI answers with real GPS data.",
    aiList: [["WhatsApp", "They type or send a voice note, and the AI answers the same way, with the map link. It recognizes each client by their phone number."], ["Tells the exact place", "“Inside your Home zone”, “in the Central Plaza parking lot”, “at Lincoln Middle School”."], ["Siri and CarPlay", "Hands-free questions from the iPhone and the car."], ["Alexa and Google Home", "Questions from the smart speaker at home."]] as [string, string][],
    soon: "Coming soon", aiSoon: 3,
    chat: [["u", "Where is the truck?"], ["b", "Your Explorer is inside your Home zone, in Miami. It is stopped with the engine off. Last report: 1 minute ago."], ["u", "voice"], ["b", "voice"], ["m", "View on the map"]] as [string, string][],
    chatName: "GPS Link Assistant", chatOn: "online",
    plans: "Plans", plansSub: "You pay per device per year. The more devices, the better the price.",
    featsH: "Everything you can do with your white label", featsSub: "Every package includes every feature. Only the number of devices changes.",
    appAlt: "GPS tracking app with map, speed and street view", appH: "Mobile app with your brand, free",
    appP: "Your clients see their vehicles in real time on Android and iPhone, with your company's logo and colors.",
    appList: ["Live location on the map", "Instant speed", "Street view with Google Maps", "Route history, alerts and engine stop"],
    startFree: "Start free",
    steps: [["Sign up free", (m: number) => `No card. Your ${m}-month trial starts.`], ["Add your brand", () => "Upload your logo and colors to your platform."], ["Sell to your clients", () => "Create your packages, charge your way and connect their GPS."], ["Grow with dealers", () => "Your dealers sell under their own brand using your devices."]] as [string, (m: number) => string][],
    chain: [["GPS Link", "sells you the package"], ["Your white label", "your pool of devices"], ["Your dealers", "with their own brand"], ["End clients", "use the app"]],
    ctaH: "Start your GPS tracking business today", ctaP: (m: number) => `${m} months free. We remind you 3, 2 and 1 day before it ends.`, ctaBtn: "Create my free account",
  },
};

export default async function Home() {
  await ensureDefaultPlans();
  const tierRows = await prisma.priceTier.findMany({ orderBy: { minDevices: "asc" } });
  const tiers: PublicTier[] = tierRows.map((t, i) => ({ id: t.id, minDevices: t.minDevices, maxDevices: tierRows[i + 1] ? tierRows[i + 1].minDevices - 1 : null, priceCents: t.priceCents, currency: t.currency }));
  const months = Math.round(TRIAL_DAYS / 30);
  const [lang, rate, showPrices] = await Promise.all([getLang(), dopRate(), showPublicPrices()]);
  const t = T[lang];

  return (
    <>
      <SiteNav path="/" />
      <div className="hero">
        <video className="hero-v" autoPlay muted loop playsInline preload="auto" poster="/hero.jpg" aria-hidden="true">
          <source src="/hero-m.mp4" type="video/mp4" media="(max-width: 900px)" />
          <source src="/hero.mp4" type="video/mp4" />
        </video>
        <div className="hero-tags" aria-hidden="true">
          {t.tags.map(([k, v], i) => (
            <div key={k} className={`htag h${i}`}><b>{k}</b><span>{v}</span></div>
          ))}
        </div>
        <div className="wrap">
          <div className="t">
            <div className="badge">{t.badge(months)}</div>
            <h1>
              {t.h1a}<span>{t.h1b}</span>
            </h1>
            <p>{t.lead}</p>
            <ul>
              {t.heroList.map((i) => <li key={i}>{i}</li>)}
            </ul>
            <Link href="#planes" className="btn">{t.start(months)}</Link>
            &nbsp;&nbsp;
            <Link href="#como-funciona" className="btn o">{t.how}</Link>
            <TrackLoginForm compact lang={lang} googleUrl={`${trackerUrl()}/google/login`} />
          </div>
        </div>
      </div>

      <section id="planes">
        <div className="wrap">
          <h2>{t.plans}</h2>
          <div className="sub">{t.plansSub}</div>
          <PricingTiers tiers={tiers} trialMonths={months} lang={lang} rate={rate} showPrices={showPrices} />
        </div>
      </section>

      <section className="ai" id="ia">
        <div className="wrap ai-in">
          <div>
            <h2>{t.aiH}</h2>
            <p className="ai-p">{t.aiP}</p>
            <div className="ai-list">
              {t.aiList.map(([title, text], i) => (
                <div key={title} className="ai-it">
                  <b>{title}{i === t.aiSoon && <em>{t.soon}</em>}</b>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="chat" aria-hidden="true">
            <div className="chat-h"><i>GL</i><div><b>{t.chatName}</b><span>{t.chatOn}</span></div></div>
            <div className="chat-b">
              {t.chat.map(([who, text], i) => (
                <div key={i} className={`bub ${who}`}>
                  {who === "m"
                    ? <><span className="pin" />{text}<small>maps.google.com</small></>
                    : text === "voz" || text === "voice"
                      ? <span className="voice"><span className="play" /><span className="wave" />{who === "u" ? "0:03" : "0:09"}</span>
                      : text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="feats" id="funciones">
        <div className="wrap">
          <h2>{t.featsH}</h2>
          <div className="sub">{t.featsSub}</div>
          <div className="fgrid">
            {t.groups.map((g) => (
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
          <img src="/app-gpslink.jpg" alt={t.appAlt} width={720} height={624} />
          <div>
            <h2>{t.appH}</h2>
            <p>{t.appP}</p>
            <ul>
              {t.appList.map((i) => <li key={i}>{i}</li>)}
            </ul>
            <a href="/registro" className="btn">{t.startFree}</a>
          </div>
        </div>
      </section>

      <section className="how" id="como-funciona">
        <div className="wrap">
          <h2>{t.how}</h2>
          <div className="steps">
            {t.steps.map(([title, text], i) => <div key={title} className="st"><div className="c">{i + 1}</div><b>{title}</b><span>{text(months)}</span></div>)}
          </div>
          <div className="chain">
            {t.chain.map(([title, text], i) => (
              <Fragment key={title}>{i > 0 && <div className="ar">→</div>}<div className="lv"><b>{title}</b><span>{text}</span></div></Fragment>
            ))}
          </div>
        </div>
      </section>

      <div className="cta">
        <h2>{t.ctaH}</h2>
        <p>{t.ctaP(months)}</p>
        <Link href="#planes" className="btn">{t.ctaBtn}</Link>
      </div>
      <footer>© {new Date().getFullYear()} GPS Link USA</footer>
    </>
  );
}
