"use server";

import { mkdir, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

const REQ_DIR = "/var/lib/gps-guard/requests";

async function requireAdmin() {
  if (!(await getSession("admin"))) redirect("/admin");
}

const back = (key: "ok" | "error", msg: string): never => redirect(`/admin/seguridad?${key}=${encodeURIComponent(msg)}`);

async function queue(formData: FormData, action: "allow" | "block" | "forget", msg: string) {
  await requireAdmin();
  const ip = String(formData.get("ip") ?? "").trim();
  if (isIP(ip) !== 4) back("error", "IP no válida.");
  await mkdir(REQ_DIR, { recursive: true });
  await writeFile(`${REQ_DIR}/${Date.now()}-${randomUUID()}.json`, JSON.stringify({ ip, action }));
  back("ok", `${ip}: ${msg} Se aplica en menos de 1 minuto.`);
}

export async function allowIpAction(formData: FormData) {
  await queue(formData, "allow", "habilitada.");
}

export async function blockIpAction(formData: FormData) {
  await queue(formData, "block", "bloqueada de nuevo.");
}

export async function forgetIpAction(formData: FormData) {
  await queue(formData, "forget", "quitada de la lista.");
}
