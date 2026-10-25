import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { prisma } from "../lib/db";
import { handleDirect, metaSetting, sealSecret } from "../lib/meta";
import { sendWhatsApp } from "../lib/notify";

const base = process.env.E2E_BASE ?? "http://localhost:3000";
const secret = "test-app-secret";

async function main() {
  const before = await prisma.metaSetting.findUnique({ where: { id: 1 } });
  const s = await metaSetting();
  await prisma.metaSetting.update({ where: { id: 1 }, data: { enabled: true, phoneNumberId: "123456789", tokenSealed: sealSecret("EAA-fake"), appSecretSealed: sealSecret(secret), template: "aviso_gpslink" } });
  const phone = `1809${String(Date.now()).slice(-7)}`;
  try {
    let r = await fetch(`${base}/api/meta/webhook?hub.mode=subscribe&hub.verify_token=${s.verifyToken}&hub.challenge=abc123`);
    assert.equal(await r.text(), "abc123");
    r = await fetch(`${base}/api/meta/webhook?hub.mode=subscribe&hub.verify_token=malo&hub.challenge=abc123`);
    assert.equal(r.status, 403);
    console.log("Verificación del webhook OK");

    const body = (id: string, text: string) => JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: phone, id, type: "text", text: { body: text } }] } }] }] });
    const post = (raw: string, sig: string) => fetch(`${base}/api/meta/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig }, body: raw });
    const sign = (raw: string) => `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
    const raw = body(`wamid.${phone}.1`, "hola");
    assert.equal((await post(raw, "sha256=00")).status, 403, "firma falsa");
    assert.equal((await post(raw, sign(raw))).status, 200);
    assert.equal((await post(raw, sign(raw))).status, 200, "reintento de Meta");
    await new Promise((res) => setTimeout(res, 3000));
    const logs = await prisma.metaLog.findMany({ where: { phone }, orderBy: { id: "asc" } });
    assert.equal(logs.filter((l) => l.direction === "in").length, 1, "el reintento no se procesa dos veces");
    const out = logs.find((l) => l.direction === "out");
    assert.ok(out && /1\. Quiero tener mi propia plataforma/.test(out.text), "responde el menú");
    assert.match(out!.error ?? "", /Meta 40/, "con token falso Meta lo rechaza");
    console.log("Mensaje entrante firmado -> respuesta OK (Meta rechazó el token de prueba como se esperaba)");

    assert.match((await handleDirect(phone, "1"))!, /registro/);
    assert.match((await handleDirect(phone, "3"))!, /asesor/);
    const two = (await handleDirect(phone, "2"))!;
    assert.ok(/vincular\?t=/.test(two) || /disponible pronto/.test(two));
    console.log("Menú (marca blanca, asesor, cliente) OK");

    const w = await sendWhatsApp(phone, "Factura de prueba");
    assert.equal(w.ok, false);
    assert.match(w.error ?? "", /Meta 40/);
    console.log("Avisos a marcas blancas salen por Meta OK");
    console.log("E2E Meta OK");
  } finally {
    await prisma.metaLog.deleteMany({ where: { phone } });
    if (before) await prisma.metaSetting.update({ where: { id: 1 }, data: { enabled: before.enabled, phoneNumberId: before.phoneNumberId, tokenSealed: before.tokenSealed, appSecretSealed: before.appSecretSealed, template: before.template } });
    else await prisma.metaSetting.delete({ where: { id: 1 } });
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
