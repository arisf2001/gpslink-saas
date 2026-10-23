"use server";

import { redirect } from "next/navigation";
import { brandMail, type BrandSmtp } from "@/lib/brand-mail";
import { companyPlatformOrigin } from "@/lib/brand-web";
import { prisma } from "@/lib/db";
import { spanishTemplates, TEMPLATE_LABELS } from "@/lib/mail-templates-es";
import { getSession } from "@/lib/session";
import { siteFor } from "@/lib/site";
import { mediaUrl } from "@/lib/site-media";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOST = /^[a-z0-9.-]{3,100}$/;

async function company() {
  const id = await getSession("company");
  if (!id) redirect("/cuenta");
  const found = await prisma.company.findUnique({ where: { id } });
  if (!found?.gpswoxUserId) redirect("/cuenta/correo?error=sin-usuario");
  return { ...found, gpswoxUserId: found.gpswoxUserId };
}

export async function saveBrandMailAction(formData: FormData) {
  const c = await company();
  const fromName = String(formData.get("fromName") ?? "").trim().slice(0, 80);
  const replyTo = String(formData.get("replyTo") ?? "").trim().toLowerCase();
  if (replyTo && !EMAIL.test(replyTo)) redirect("/cuenta/correo?error=correo");
  try {
    await brandMail(c.gpswoxUserId, { fromName: fromName || c.name, replyTo });
  } catch {
    redirect("/cuenta/correo?error=plataforma");
  }
  redirect("/cuenta/correo?ok=guardado");
}

export async function testBrandMailAction(formData: FormData) {
  const c = await company();
  const to = String(formData.get("testTo") ?? "").trim() || c.email;
  if (!EMAIL.test(to)) redirect("/cuenta/correo?error=correo");
  let res: { ok: boolean; error: string | null } | undefined;
  try {
    res = (await brandMail(c.gpswoxUserId, { testTo: to })).test;
  } catch {
    redirect("/cuenta/correo?error=plataforma");
  }
  redirect(res?.ok ? `/cuenta/correo?ok=prueba&to=${encodeURIComponent(to)}` : "/cuenta/correo?error=envio");
}

export async function saveSmtpAction(formData: FormData) {
  const c = await company();
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const fromEmail = get("fromEmail").toLowerCase();
  const host = get("host").toLowerCase();
  const security = get("security");
  const port = Number(get("port"));
  if (!EMAIL.test(fromEmail)) redirect("/cuenta/correo?error=correo#smtp");
  if (!HOST.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) redirect("/cuenta/correo?error=servidor#smtp");
  const smtp: Omit<BrandSmtp, "has_password"> & { password?: string } = {
    enabled: formData.get("enabled") === "on",
    provider: get("provider").slice(0, 30),
    host,
    port,
    security: security === "ssl" || security === "" ? security : "tls",
    username: (get("username") || fromEmail).slice(0, 150),
    from_email: fromEmail,
    password: String(formData.get("password") ?? "").replace(/\s+/g, "") || undefined,
  };
  const testTo = formData.get("intent") === "test" ? get("testTo") || c.email : "";
  if (testTo && !EMAIL.test(testTo)) redirect("/cuenta/correo?error=correo#smtp");
  let test: { ok: boolean; error: string | null } | undefined;
  try {
    await brandMail(c.gpswoxUserId, { smtp });
    if (testTo) test = (await brandMail(c.gpswoxUserId, { testTo, testBrandSmtp: true })).test;
  } catch {
    redirect("/cuenta/correo?error=plataforma#smtp");
  }
  if (!testTo) redirect("/cuenta/correo?ok=smtp#smtp");
  if (test?.ok) redirect(`/cuenta/correo?ok=smtp-prueba&to=${encodeURIComponent(testTo)}#smtp`);
  redirect(`/cuenta/correo?error=smtp-envio&msg=${encodeURIComponent((test?.error ?? "").slice(0, 300))}#smtp`);
}

export async function removeSmtpAction() {
  const c = await company();
  try {
    await brandMail(c.gpswoxUserId, { smtp: null });
  } catch {
    redirect("/cuenta/correo?error=plataforma#smtp");
  }
  redirect("/cuenta/correo?ok=smtp-quitado#smtp");
}

export async function saveLayoutAction(formData: FormData) {
  const c = await company();
  const color = String(formData.get("color") ?? "");
  const site = siteFor(c);
  try {
    await brandMail(c.gpswoxUserId, {
      layout: {
        enabled: formData.get("enabled") === "on",
        color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : c.brandColor ?? "#0F4C5C",
        logo_url: site.logo ? mediaUrl(site.logo) : "",
        footer: String(formData.get("footer") ?? "").slice(0, 500),
      },
    });
  } catch {
    redirect("/cuenta/correo?error=plataforma#diseno");
  }
  redirect("/cuenta/correo?ok=diseno#diseno");
}

export async function spanishTemplatesAction() {
  const c = await company();
  try {
    await brandMail(c.gpswoxUserId, { templateSave: spanishTemplates(c.name, companyPlatformOrigin(c)) });
  } catch {
    redirect("/cuenta/correo?error=plataforma#plantillas");
  }
  redirect("/cuenta/correo?ok=espanol#plantillas");
}

export async function saveTemplateAction(formData: FormData) {
  const c = await company();
  const name = String(formData.get("name") ?? "");
  if (!TEMPLATE_LABELS[name]) redirect("/cuenta/correo#plantillas");
  const title = String(formData.get("title") ?? "").trim().slice(0, 250);
  const note = String(formData.get("note") ?? "").slice(0, 20000);
  if (!title || !note.trim()) redirect(`/cuenta/correo?error=plantilla#t-${name}`);
  try {
    if (formData.get("intent") === "reset") await brandMail(c.gpswoxUserId, { templateReset: [name] });
    else await brandMail(c.gpswoxUserId, { templateSave: [{ name, title, note }] });
  } catch {
    redirect(`/cuenta/correo?error=plataforma#t-${name}`);
  }
  redirect(`/cuenta/correo?ok=plantilla#t-${name}`);
}
