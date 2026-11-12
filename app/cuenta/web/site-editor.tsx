import { LIMITS, SECTION_KEYS, SOCIAL_KEYS, type ImageKey, type SiteData, type SiteItem, type TextKey } from "@/lib/site";
import { mediaUrl } from "@/lib/site-media";
import { resetSiteAction, saveSiteAction } from "./site-actions";

const SECTION_LABELS: Record<(typeof SECTION_KEYS)[number], string> = {
  products: "Productos",
  features: "Características",
  steps: "Cómo funciona",
  faq: "Preguntas frecuentes",
  cta: "Llamado final (Regístrate)",
};
const SOCIAL_LABELS: Record<(typeof SOCIAL_KEYS)[number], string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" };
const box: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px", background: "#fff" };
const sum: React.CSSProperties = { cursor: "pointer", fontWeight: 800, fontSize: 15 };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12, marginTop: 12, alignItems: "start" };

function Text({ site, k, label, area }: { site: SiteData; k: TextKey; label: string; area?: boolean }) {
  return (
    <label>
      {label}
      {area ? <textarea name={k} defaultValue={site[k]} rows={3} /> : <input name={k} defaultValue={site[k]} />}
    </label>
  );
}

function ImageField({ name, current, label, hint }: { name: string; current: string; label: string; hint?: string }) {
  return (
    <label>
      {label}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {current && <img src={mediaUrl(current)} alt="" style={{ maxHeight: 60, maxWidth: 200, objectFit: "contain", background: "#f1f5f9", borderRadius: 8, padding: 4 }} />}
      <input type="hidden" name={name} value={current} />
      <input type="file" name={`${name}File`} accept="image/png,image/jpeg,image/webp,image/gif,image/x-icon" />
      {current && <span className="hint"><input type="checkbox" name={`${name}Remove`} style={{ width: "auto" }} /> Quitar imagen</span>}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

function Items({ kind, items, max, withImage }: { kind: "products" | "features" | "steps"; items: SiteItem[]; max: number; withImage?: boolean }) {
  const slots = Array.from({ length: max }, (_, i) => items[i] ?? { title: "", text: "", image: "", price: "" });
  return (
    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
      {slots.map((it, i) => (
        <div key={i} style={{ ...box, background: "#f8fafc", display: "grid", gap: 10 }}>
          <b style={{ fontSize: 13, color: "#475569" }}>#{i + 1} {it.title ? "" : "(vacío: escribe un título para agregarlo)"}</b>
          <label>Título<input name={`${kind}.${i}.title`} defaultValue={it.title} /></label>
          <label>Descripción<textarea name={`${kind}.${i}.text`} defaultValue={it.text} rows={2} /></label>
          {withImage && (
            <>
              <label>Precio (opcional, déjalo vacío para no mostrarlo)<input name={`${kind}.${i}.price`} defaultValue={it.price} placeholder="Ej.: RD$ 4,500" /></label>
              <ImageField name={`${kind}.${i}.image`} current={it.image} label="Foto (opcional)" />
            </>
          )}
        </div>
      ))}
      <p className="hint">Para quitar uno, borra su título.</p>
    </div>
  );
}

export function SiteEditor({ site, slug }: { site: SiteData; slug: string }) {
  const img = (k: ImageKey) => site[k];
  const faq = Array.from({ length: LIMITS.faq }, (_, i) => site.faq[i] ?? { q: "", a: "" });
  return (
    <>
      <form action={saveSiteAction} className="form" style={{ gap: 12 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 15 }}>
          <input type="checkbox" name="published" defaultChecked={site.published} style={{ width: "auto" }} /> Web publicada (si la desmarcas, nadie la ve)
        </label>

        <details style={box} open>
          <summary style={sum}>Marca: nombre, logo y colores</summary>
          <div style={grid2}>
            <Text site={site} k="name" label="Nombre de la marca" />
            <label>Color principal<input type="color" name="primary" defaultValue={site.primary} style={{ height: 44, padding: 4 }} /></label>
            <label>Color oscuro (fondo)<input type="color" name="secondary" defaultValue={site.secondary} style={{ height: 44, padding: 4 }} /></label>
            <ImageField name="logo" current={img("logo")} label="Logo" hint="PNG, JPG o WEBP, máximo 3 MB." />
            <ImageField name="logoDark" current={img("logoDark")} label="Logo para fondo oscuro (pie de página)" />
            <ImageField name="favicon" current={img("favicon")} label="Ícono de la pestaña (favicon)" hint="Cuadrado, PNG o ICO." />
          </div>
        </details>

        <details style={box}>
          <summary style={sum}>Portada y botones</summary>
          <div style={grid2}>
            <Text site={site} k="topBar" label="Barra de arriba (vacío = no se muestra)" />
            <Text site={site} k="heroTag" label="Etiqueta pequeña" />
            <Text site={site} k="heroTitle" label="Título" />
            <Text site={site} k="heroHighlight" label="Título en color" />
            <Text site={site} k="heroText" label="Texto de la portada" area />
            <ImageField name="heroImage" current={img("heroImage")} label="Imagen de la portada (opcional)" hint="Si no pones una, sale el mapa." />
            <Text site={site} k="loginLabel" label="Botón Entrar (vacío = no se muestra)" />
            <Text site={site} k="registerLabel" label="Botón Regístrate de arriba" />
            <Text site={site} k="heroButton" label="Botón de la portada" />
            <Text site={site} k="productButton" label="Botón de cada producto" />
          </div>
          <p className="hint" style={{ marginTop: 8 }}>Los botones llevan a tu plataforma: Entrar abre la entrada, y Regístrate crea la cuenta del cliente dentro de tu marca.</p>
        </details>

        <details style={box}>
          <summary style={sum}>Secciones que se muestran</summary>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12 }}>
            {SECTION_KEYS.map((k) => (
              <label key={k} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" name={`sec:${k}`} defaultChecked={site.sections[k]} style={{ width: "auto" }} /> {SECTION_LABELS[k]}
              </label>
            ))}
          </div>
        </details>

        <details style={box}>
          <summary style={sum}>Productos ({site.products.length})</summary>
          <div style={grid2}><Text site={site} k="productsTitle" label="Título de la sección" /><Text site={site} k="productsSub" label="Subtítulo" /></div>
          <Items kind="products" items={site.products} max={LIMITS.products} withImage />
        </details>

        <details style={box}>
          <summary style={sum}>Características ({site.features.length})</summary>
          <div style={grid2}><Text site={site} k="featuresTitle" label="Título de la sección" /><Text site={site} k="featuresSub" label="Subtítulo" /></div>
          <Items kind="features" items={site.features} max={LIMITS.features} />
        </details>

        <details style={box}>
          <summary style={sum}>Cómo funciona ({site.steps.length} pasos)</summary>
          <div style={grid2}><Text site={site} k="stepsTitle" label="Título de la sección" /><Text site={site} k="stepsSub" label="Subtítulo" /></div>
          <Items kind="steps" items={site.steps} max={LIMITS.steps} />
        </details>

        <details style={box}>
          <summary style={sum}>Preguntas frecuentes ({site.faq.length})</summary>
          <div style={grid2}><Text site={site} k="faqTitle" label="Título de la sección" /><Text site={site} k="faqSub" label="Subtítulo" /></div>
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            {faq.map((f, i) => (
              <div key={i} style={{ ...box, background: "#f8fafc", display: "grid", gap: 10 }}>
                <label>Pregunta #{i + 1}<input name={`faq.${i}.q`} defaultValue={f.q} /></label>
                <label>Respuesta<textarea name={`faq.${i}.a`} defaultValue={f.a} rows={2} /></label>
              </div>
            ))}
            <p className="hint">Para quitar una, borra la pregunta.</p>
          </div>
        </details>

        <details style={box}>
          <summary style={sum}>Llamado final, pie de página y redes</summary>
          <div style={grid2}>
            <Text site={site} k="ctaTitle" label="Título del llamado final" />
            <Text site={site} k="ctaText" label="Texto del llamado final" />
            <Text site={site} k="ctaButton" label="Botón del llamado final" />
            <Text site={site} k="footerText" label="Texto del pie de página" />
            {SOCIAL_KEYS.map((k) => (
              <label key={k}>{SOCIAL_LABELS[k]} (enlace, opcional)<input name={`social:${k}`} defaultValue={site.social[k]} placeholder="https://" /></label>
            ))}
          </div>
        </details>

        <details style={box}>
          <summary style={sum}>Google (SEO)</summary>
          <div style={grid2}>
            <Text site={site} k="seoTitle" label="Título en Google y en la pestaña" />
            <Text site={site} k="seoDescription" label="Descripción en Google" area />
          </div>
        </details>

        <div className="row">
          <button className="btn dark">Guardar cambios</button>
          <a className="btn sm s" href={`/sitio/${slug}?vista=1`} target="_blank" rel="noreferrer">Vista previa</a>
        </div>
      </form>
      <form action={resetSiteAction} style={{ marginTop: 14 }}>
        <button className="btn sm" style={{ background: "#fff", color: "#991b1b", border: "1.5px solid #fecaca" }}>Restaurar textos y colores originales</button>
        <span className="hint" style={{ marginLeft: 8 }}>Mantiene tus logos y si la web está publicada.</span>
      </form>
    </>
  );
}
