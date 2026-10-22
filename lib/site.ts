import { mediaUrl } from "@/lib/site-media";
import { FEATURE_SVGS, HERO_SVG, PRODUCT_SVGS, SITE_CSS } from "@/lib/site-template";

export type SiteItem = { title: string; text: string; image: string; price: string };
export type SiteFaq = { q: string; a: string };
export const SECTION_KEYS = ["products", "features", "steps", "faq", "cta"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export const IMAGE_KEYS = ["logo", "logoDark", "favicon", "heroImage"] as const;
export type ImageKey = (typeof IMAGE_KEYS)[number];
export const SOCIAL_KEYS = ["facebook", "instagram", "tiktok", "youtube"] as const;
export const TEXT_KEYS = [
  "name", "topBar", "heroTag", "heroTitle", "heroHighlight", "heroText",
  "loginLabel", "registerLabel", "heroButton", "productButton",
  "productsTitle", "productsSub", "featuresTitle", "featuresSub", "stepsTitle", "stepsSub",
  "faqTitle", "faqSub", "ctaTitle", "ctaText", "ctaButton",
  "seoTitle", "seoDescription", "footerText",
] as const;
export type TextKey = (typeof TEXT_KEYS)[number];
export const LIMITS = { products: 8, features: 6, steps: 6, faq: 12 } as const;

export type SiteData = Record<TextKey, string> & Record<ImageKey, string> & {
  published: boolean;
  primary: string;
  secondary: string;
  sections: Record<SectionKey, boolean>;
  social: Record<(typeof SOCIAL_KEYS)[number], string>;
  products: SiteItem[];
  features: SiteItem[];
  steps: SiteItem[];
  faq: SiteFaq[];
};

const item = (title: string, text: string): SiteItem => ({ title, text, image: "", price: "" });

export function defaultSite(name: string, color?: string | null): SiteData {
  return {
    published: false,
    name,
    topBar: "Rastreo satelital 24/7 en toda la República Dominicana",
    heroTag: "Rastreo GPS · Web y app",
    heroTitle: "Tu vehículo,",
    heroHighlight: "a un clic de distancia.",
    heroText: "Seleccionamos los mejores rastreadores GPS del mercado y te damos una plataforma para ver tu vehículo en tiempo real, recibir alertas y apagar el motor a distancia desde tu celular.",
    loginLabel: "Entrar",
    registerLabel: "Regístrate",
    heroButton: "Regístrate gratis",
    productButton: "Regístrate",
    productsTitle: "Nuestra selección especial para ti",
    productsSub: "Equipos probados en nuestra plataforma, listos para instalar.",
    featuresTitle: "Características principales",
    featuresSub: "Todo lo que necesitas para cuidar tu vehículo.",
    stepsTitle: "Cómo funciona",
    stepsSub: "Empieza en minutos.",
    faqTitle: "Preguntas frecuentes",
    faqSub: "Resolvemos tus dudas.",
    ctaTitle: "Empieza a cuidar tu vehículo hoy",
    ctaText: "Crea tu cuenta gratis y agrega tu primer equipo.",
    ctaButton: "Regístrate",
    seoTitle: `${name} – Rastreo satelital para tu vehículo`,
    seoDescription: "Rastreadores GPS y servicio anual de rastreo satelital. Mira tu vehículo en tiempo real desde la web y la app.",
    footerText: "Todos los derechos reservados.",
    logo: "",
    logoDark: "",
    favicon: "",
    heroImage: "",
    primary: color && /^#[0-9a-f]{6}$/i.test(color) ? color : "#4271ff",
    secondary: "#0b1430",
    sections: { products: true, features: true, steps: true, faq: true, cta: true },
    social: { facebook: "", instagram: "", tiktok: "", youtube: "" },
    products: [
      item("Rastreador GT06 para vehículos", "Se instala oculto en carros, jeepetas y camiones. Ubicación en tiempo real y corte de motor a distancia."),
      item("Rastreador SinoTrack para motores", "Pequeño y resistente al agua, ideal para motocicletas y pasolas. Alertas de movimiento y de encendido."),
      item("J16 BLE con relé Bluetooth", "Rastreador con relé inalámbrico para la bomba de combustible. Apaga el vehículo sin cortar cables."),
      item("Servicio anual de rastreo", "Plataforma web y app para Android y iPhone, alertas por WhatsApp y correo, historial de recorridos y soporte."),
    ],
    features: [
      item("Ubicación en tiempo real", "Mira dónde está tu vehículo en cualquier momento, con su velocidad y su recorrido del día."),
      item("Alertas al instante", "Exceso de velocidad, encendido, entrada y salida de zonas, botón de pánico y más, por WhatsApp y correo."),
      item("Apagado a distancia", "En caso de robo, apaga el motor desde la app o la web y vuelve a encenderlo cuando quieras."),
    ],
    steps: [
      item("Regístrate", `Crea tu cuenta gratis en la plataforma de ${name} con tu correo o con Google.`),
      item("Instala tu equipo", "Coloca tu rastreador en el vehículo y agrégalo a tu cuenta con su número IMEI."),
      item("Rastrea desde tu celular", "Entra desde la web o la app y mira tu vehículo en el mapa, con alertas en tu WhatsApp."),
    ],
    faq: [
      { q: "¿En qué zonas funciona el rastreo?", a: "En todo el territorio de la República Dominicana, y en cualquier lugar con cobertura de la red celular del equipo." },
      { q: "¿Necesito pagar una mensualidad?", a: "No. El servicio de rastreo se paga una vez al año e incluye la plataforma web, la app y las alertas." },
      { q: "¿Puedo ver mi vehículo desde el celular?", a: "Sí, desde la app para Android y iPhone o desde cualquier navegador entrando a tu cuenta." },
      { q: "¿Cómo apago mi vehículo si me lo roban?", a: "Desde la app o la web, con el botón de apagar motor. El equipo debe tener instalado el relé de corte." },
      { q: "¿Qué pasa si se desconecta el equipo?", a: "Te llega una alerta cuando el equipo deja de reportar o lo desconectan de la batería del vehículo." },
    ],
  };
}

const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function items(v: unknown, fallback: SiteItem[]): SiteItem[] {
  if (!Array.isArray(v)) return fallback;
  return v.map((x) => {
    const o = obj(x);
    return { title: str(o.title, ""), text: str(o.text, ""), image: str(o.image, ""), price: str(o.price, "") };
  });
}

export function siteFor(company: { name: string; brandColor: string | null; siteData: unknown }): SiteData {
  const d = defaultSite(company.name, company.brandColor);
  const s = obj(company.siteData);
  const out = { ...d } as SiteData;
  for (const k of [...TEXT_KEYS, ...IMAGE_KEYS, "primary", "secondary"] as const) out[k] = str(s[k], d[k]);
  out.published = typeof s.published === "boolean" ? s.published : d.published;
  const sec = obj(s.sections);
  out.sections = Object.fromEntries(SECTION_KEYS.map((k) => [k, typeof sec[k] === "boolean" ? sec[k] : d.sections[k]])) as SiteData["sections"];
  const soc = obj(s.social);
  out.social = Object.fromEntries(SOCIAL_KEYS.map((k) => [k, str(soc[k], "")])) as SiteData["social"];
  out.products = items(s.products, d.products);
  out.features = items(s.features, d.features);
  out.steps = items(s.steps, d.steps);
  out.faq = Array.isArray(s.faq) ? s.faq.map((x) => ({ q: str(obj(x).q, ""), a: str(obj(x).a, "") })) : d.faq;
  return out;
}

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const color = (v: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : fallback);
const safeUrl = (v: string) => (/^https?:\/\/[^\s"'<>]+$/i.test(v) ? v : "");

export function renderSite(site: SiteData, platform: string, preview = false): string {
  const login = `${platform}/login`;
  const register = `${platform}/register/create`;
  const logo = (file: string, dark: boolean) =>
    file ? `<img src="${esc(mediaUrl(file))}" alt="${esc(site.name)}">` : `<span class="logo-text">${esc(site.name)}</span>${dark ? "" : ""}`;
  const btn = (label: string, href: string, cls = "p") => (label ? `<a class="btn ${cls}" href="${esc(href)}">${esc(label)}</a>` : "");
  const head = (title: string, sub: string) => `<h2>${esc(title)}</h2>${sub ? `<p class="sub">${esc(sub)}</p>` : ""}`;
  const on = (k: SectionKey, list?: unknown[]) => site.sections[k] && (!list || list.length > 0);
  const links: string[] = [];
  if (on("products", site.products)) links.push(`<a href="#equipos">${esc(site.productsTitle.split(" ").length > 3 ? "Equipos" : site.productsTitle)}</a>`);
  if (on("features", site.features)) links.push(`<a href="#caracteristicas">${esc(site.featuresTitle.split(" ").length > 3 ? "Características" : site.featuresTitle)}</a>`);
  if (on("steps", site.steps)) links.push(`<a href="#como">${esc(site.stepsTitle)}</a>`);
  if (on("faq", site.faq)) links.push(`<a href="#preguntas">Preguntas</a>`);
  const socials = SOCIAL_KEYS.map((k) => [k, safeUrl(site.social[k])]).filter(([, u]) => u);
  const label: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" };

  const parts: string[] = [];
  if (preview) parts.push(`<div style="background:#fef3c7;color:#92400e;text-align:center;padding:8px;font-weight:700;font-size:13px">Vista previa${site.published ? "" : " · esta web todavía no está publicada"}</div>`);
  if (site.topBar) parts.push(`<div class="top">${esc(site.topBar)}</div>`);
  parts.push(`<header><div class="w"><a href="/">${logo(site.logo, false)}</a><nav>${links.join("")}</nav><div class="btns">${btn(site.loginLabel, login, "o")}${btn(site.registerLabel, register)}</div></div></header>`);
  parts.push(`<div class="hero"><div class="w"><div>${site.heroTag ? `<span class="tag">${esc(site.heroTag)}</span>` : ""}<h1>${esc(site.heroTitle)} <span>${esc(site.heroHighlight)}</span></h1>${site.heroText ? `<p>${esc(site.heroText)}</p>` : ""}<div class="btns">${btn(site.heroButton, register)}${on("products", site.products) ? `<a class="btn o" href="#equipos">Ver equipos</a>` : ""}</div></div><div class="map">${site.heroImage ? `<img src="${esc(mediaUrl(site.heroImage))}" alt="">` : HERO_SVG}</div></div></div>`);
  if (on("products", site.products)) {
    const cards = site.products.map((p, i) => `<div class="card"><div class="ic">${p.image ? `<img src="${esc(mediaUrl(p.image))}" alt="${esc(p.title)}">` : PRODUCT_SVGS[i % PRODUCT_SVGS.length]}</div><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p>${p.price ? `<div class="price">${esc(p.price)}</div>` : ""}${btn(site.productButton, register)}</div>`);
    parts.push(`<section id="equipos"><div class="w">${head(site.productsTitle, site.productsSub)}<div class="grid">${cards.join("")}</div></div></section>`);
  }
  if (on("features", site.features)) {
    const fs = site.features.map((f, i) => `<div class="f"><div class="n">${FEATURE_SVGS[i % FEATURE_SVGS.length]}</div><h3>${esc(f.title)}</h3><p>${esc(f.text)}</p></div>`);
    parts.push(`<section id="caracteristicas" class="feat"><div class="w">${head(site.featuresTitle, site.featuresSub)}<div class="f3">${fs.join("")}</div></div></section>`);
  }
  if (on("steps", site.steps)) {
    const st = site.steps.map((s) => `<div class="st"><b>${esc(s.title)}</b><p>${esc(s.text)}</p></div>`);
    parts.push(`<section id="como"><div class="w">${head(site.stepsTitle, site.stepsSub)}<div class="steps">${st.join("")}</div></div></section>`);
  }
  if (on("faq", site.faq)) {
    const fq = site.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`);
    parts.push(`<section id="preguntas" class="feat"><div class="w">${head(site.faqTitle, site.faqSub)}<div class="faq">${fq.join("")}</div></div></section>`);
  }
  if (on("cta")) parts.push(`<section class="cta"><div class="w"><h2>${esc(site.ctaTitle)}</h2>${site.ctaText ? `<p>${esc(site.ctaText)}</p>` : ""}${btn(site.ctaButton, register)}</div></section>`);
  const soc = socials.length ? `<div class="soc">${socials.map(([k, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${label[k]}</a>`).join("")}</div>` : "";
  parts.push(`<footer><div class="w">${logo(site.logoDark || site.logo, true)}${soc}<span>© ${new Date().getFullYear()} ${esc(site.name)}. ${esc(site.footerText)}</span></div></footer>`);

  const favicon = site.favicon ? `<link rel="icon" href="${esc(mediaUrl(site.favicon))}">` : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(site.seoTitle || site.name)}</title><meta name="description" content="${esc(site.seoDescription)}"><meta property="og:title" content="${esc(site.seoTitle || site.name)}"><meta property="og:description" content="${esc(site.seoDescription)}">${site.logo ? `<meta property="og:image" content="${esc(mediaUrl(site.logo))}">` : ""}${favicon}<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700;800;900&display=swap" rel="stylesheet"><style>:root{--b:${color(site.primary, "#4271ff")};--d:${color(site.secondary, "#0b1430")}}${SITE_CSS}</style></head><body>${parts.join("\n")}</body></html>`;
}
