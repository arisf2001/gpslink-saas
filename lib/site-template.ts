// Generated from the original DePo GPS landing; colors come from --b (primary) and --d (secondary).
export const SITE_CSS = `:root{--t:#1f2937;--m:#6b7280;--l:color-mix(in srgb,var(--b) 7%,#fff)}
*{box-sizing:border-box}body{margin:0;font-family:Montserrat,system-ui,sans-serif;color:var(--t);background:#fff}
a{color:inherit;text-decoration:none}.w{max-width:1180px;margin:0 auto;padding:0 20px}
.top{background:var(--d);color:#fff;font-size:13px;font-weight:600;text-align:center;padding:8px}
header{position:sticky;top:0;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.06);z-index:9}
header .w{display:flex;align-items:center;justify-content:space-between;height:78px;gap:20px}
header img{height:52px}nav{display:flex;gap:26px;font-weight:700;font-size:15px}nav a:hover{color:var(--b)}
.btns{display:flex;gap:10px}.btn{display:inline-block;padding:12px 22px;border-radius:999px;font-weight:800;font-size:15px;border:2px solid var(--b);transition:.2s}
.btn.p{background:var(--b);color:#fff}.btn.p:hover{filter:brightness(.92)}.btn.o{color:var(--b)}.btn.o:hover{background:var(--l)}
.hero{background:radial-gradient(circle at 75% 40%,color-mix(in srgb,var(--b) 45%,var(--d)) 0,var(--d) 60%);color:#fff;padding:90px 0}
.hero .w{display:grid;grid-template-columns:1.1fr .9fr;gap:40px;align-items:center}
.tag{display:inline-block;background:color-mix(in srgb,var(--b) 25%,transparent);color:#e3e9ff;padding:6px 14px;border-radius:999px;font-size:13px;font-weight:700;margin-bottom:18px}
.hero h1{font-size:52px;line-height:1.08;margin:0 0 18px;font-weight:900}.hero h1 span{color:color-mix(in srgb,var(--b) 55%,#fff)}
.hero p{font-size:18px;line-height:1.6;color:#d6def5;margin:0 0 30px;max-width:560px}
.hero .btn.o{color:#fff;border-color:#fff}.hero .btn.o:hover{background:rgba(255,255,255,.1)}
.map{position:relative;aspect-ratio:1;max-width:440px;margin-left:auto;border-radius:32px;background:linear-gradient(145deg,color-mix(in srgb,var(--b) 30%,var(--d)),var(--d));color:var(--b);box-shadow:0 30px 60px rgba(0,0,0,.35);overflow:hidden}
.map svg{width:100%;height:100%}
section{padding:80px 0}h2{font-size:34px;font-weight:900;text-align:center;margin:0 0 12px}.sub{text-align:center;color:var(--m);margin:0 0 46px;font-size:17px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px}
.card{border:1px solid #e5e7eb;border-radius:20px;padding:26px;display:flex;flex-direction:column;transition:.2s;background:#fff}
.card:hover{transform:translateY(-4px);box-shadow:0 18px 40px rgba(17,24,39,.1)}
.ic{color:var(--b);width:100%;aspect-ratio:4/3;border-radius:14px;background:var(--l);display:flex;align-items:center;justify-content:center;margin-bottom:18px}
.ic svg{width:44%;height:auto}.card h3{font-size:18px;margin:0 0 8px;font-weight:800}.card p{color:var(--m);line-height:1.55;margin:0 0 18px;font-size:15px;flex:1}
.card .btn{text-align:center;padding:10px}
.feat{background:var(--l)}.f3{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.f{background:#fff;border-radius:20px;padding:30px;text-align:center}.f .n{width:62px;height:62px;border-radius:16px;background:var(--b);display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
.f .n svg{width:30px;height:30px}.f h3{margin:0 0 8px;font-size:19px;font-weight:800}.f p{margin:0;color:var(--m);line-height:1.55}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;counter-reset:s}.st{padding:28px;border-radius:20px;border:1px solid #e5e7eb}
.st b{display:block;font-size:19px;margin-bottom:8px}.st:before{counter-increment:s;content:counter(s);display:flex;width:40px;height:40px;border-radius:50%;background:var(--d);color:#fff;font-weight:900;align-items:center;justify-content:center;margin-bottom:14px}.st p{margin:0;color:var(--m);line-height:1.55}
.faq{max-width:820px;margin:0 auto}details{border-bottom:1px solid #e5e7eb;padding:20px 4px}summary{cursor:pointer;font-weight:800;font-size:17px;list-style:none;display:flex;justify-content:space-between;gap:16px}
summary::-webkit-details-marker{display:none}summary:after{content:"+";color:var(--b);font-size:24px;line-height:1}details[open] summary:after{content:"–"}details p{color:var(--m);line-height:1.6;margin:12px 0 0}
.cta{background:var(--d);color:#fff;text-align:center}.cta h2{color:#fff}.cta p{color:#cdd6f0;margin:0 0 28px;font-size:17px}
footer{background:color-mix(in srgb,var(--d) 65%,#000);color:#9aa6c4;padding:36px 0;font-size:14px}footer .w{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap}footer img{height:44px}
@media(max-width:960px){nav{display:none}.hero .w{grid-template-columns:1fr}.map{display:none}.hero h1{font-size:38px}.grid{grid-template-columns:repeat(2,1fr)}.f3,.steps{grid-template-columns:1fr}}
@media(max-width:560px){.grid{grid-template-columns:1fr}header img{height:40px}.btn{padding:10px 16px;font-size:14px}.hero{padding:60px 0}}
.ic img{width:100%;height:100%;object-fit:cover;border-radius:14px}.map img{width:100%;height:100%;object-fit:cover}.price{font-weight:900;font-size:20px;color:var(--b);margin:0 0 14px}.logo-text{font-weight:900;font-size:24px;color:var(--d)}footer .logo-text{color:#fff}.soc{display:flex;gap:14px}.soc a{color:#fff;font-weight:700}`;

export const HERO_SVG = `<svg viewBox="0 0 400 400" fill="none">
    <g stroke="#2c4594" stroke-width="2"><path d="M0 80h400M0 160h400M0 240h400M0 320h400M80 0v400M160 0v400M240 0v400M320 0v400"/></g>
    <path d="M40 330C110 300 120 220 190 210S300 150 350 70" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-dasharray="2 18"/>
    <circle cx="40" cy="330" r="10" fill="#8fb0ff"/>
    <path d="M350 18c-24 0-42 18-42 41 0 31 42 66 42 66s42-35 42-66c0-23-18-41-42-41z" fill="currentColor"/><circle cx="350" cy="59" r="15" fill="#fff"/>
    <rect x="150" y="250" width="200" height="90" rx="16" fill="#fff"/><text x="170" y="285" fill="#0b1430" font-family="Montserrat" font-weight="800" font-size="18">En movimiento</text><text x="170" y="315" fill="#6b7280" font-family="Montserrat" font-weight="600" font-size="15">48 km/h · hace 5 s</text>
  </svg>`;

export const PRODUCT_SVGS = [
  `<svg viewBox="0 0 64 64" fill="none"><rect x="10" y="16" width="44" height="32" rx="8" fill="currentColor"/><circle cx="32" cy="32" r="7" fill="#fff"/><path d="M20 52h24" stroke="#0b1430" stroke-width="4" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 64 64" fill="none"><circle cx="18" cy="44" r="9" stroke="#0b1430" stroke-width="4"/><circle cx="48" cy="44" r="9" stroke="#0b1430" stroke-width="4"/><path d="M18 44l10-18h12l8 18" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/></svg>`,
  `<svg viewBox="0 0 64 64" fill="none"><rect x="14" y="10" width="36" height="44" rx="8" fill="currentColor"/><path d="M28 24l10 8-10 8M28 24v16" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  `<svg viewBox="0 0 64 64" fill="none"><rect x="20" y="6" width="24" height="52" rx="6" fill="#0b1430"/><path d="M32 18c-6 0-10 4-10 9 0 7 10 15 10 15s10-8 10-15c0-5-4-9-10-9z" fill="currentColor"/><circle cx="32" cy="27" r="3.5" fill="#fff"/></svg>`,
];

export const FEATURE_SVGS = [
  `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M12 2v10M6.3 6.3a8 8 0 1 0 11.4 0"/></svg>`,
];
