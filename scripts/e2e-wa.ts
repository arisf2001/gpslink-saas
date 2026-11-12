import assert from "node:assert/strict";
import { prisma } from "../lib/db";
import { resolveUser, setPin } from "../lib/ai/assistant";
import { mockCommands } from "../lib/ai/gps";
import { handleIncoming, internalKey, linkPhone, queueWa, readLinkToken } from "../lib/wa";
import { POST as internalRoute } from "../app/api/internal/wa/route";

const stamp = Date.now();

async function main() {
  assert.equal(process.env.GPSWOX_MODE, "mock");
  const plan = await prisma.plan.findFirstOrThrow();
  const rid = 600000 + (stamp % 100000);
  const company = await prisma.company.create({ data: { name: "Rastreo WA", slug: `rastreo-wa-${stamp}`, contactName: "T", email: `wa-${stamp}@x.com`, phone: "0", passwordHash: "x", planId: plan.id, trialEndsAt: new Date(Date.now() + 864e5), status: "TRIAL", gpswoxUserId: rid, aiEnabled: true } });
  const client = await prisma.mockClient.create({ data: { managerId: rid, email: `wa-cliente-${stamp}@x.com` } });
  const phone = "18095550101";
  try {
    const first = await handleIncoming(company.id, phone, "hola");
    assert.ok(first);
    const token = /vincular\?t=(\S+)/.exec(first!)?.[1];
    assert.deepEqual(readLinkToken(token), { companyId: company.id, phone });
    assert.equal(readLinkToken(token, Date.now() + 31 * 60_000), null, "el enlace vence");
    assert.equal(readLinkToken(token!.slice(0, -2) + "xx"), null, "firma");
    console.log("Número desconocido -> enlace para conectar OK");

    const user = await resolveUser(`mock:${client.email}`);
    await linkPhone(company.id, phone, user);
    let r = await handleIncoming(company.id, phone, "¿Dónde está el Aveo?");
    console.log("  >", r);
    assert.match(r!, /27 de Febrero/);
    assert.match(r!, /google\.com\/maps/);

    r = await handleIncoming(company.id, phone, "Apaga el motor del Aveo");
    assert.equal((await prisma.waLink.findFirstOrThrow({ where: { companyId: company.id } })).pendingToken, null, "sin PIN no hay orden");
    assert.equal((await setPin(user, "mockpass", "4821", "es")).ok, true);
    r = await handleIncoming(company.id, phone, "Ya tengo PIN. Apaga el motor del Aveo");
    console.log("  >", r);
    assert.match(r!, /responde con tu PIN/);
    assert.match((await handleIncoming(company.id, phone, "0000"))!, /quedan 2/);
    assert.equal(mockCommands.length, 0);
    r = await handleIncoming(company.id, phone, "4821");
    console.log("  >", r);
    assert.deepEqual(mockCommands, [{ deviceId: 9001, type: "engineStop" }]);
    console.log("Apagar con PIN por WhatsApp OK");

    assert.match((await handleIncoming(company.id, "18095550199", "¿Dónde está el Aveo?"))!, /vincular/, "otro número no ve nada");
    await prisma.company.update({ where: { id: company.id }, data: { aiEnabled: false } });
    assert.equal(await handleIncoming(company.id, phone, "hola"), null, "sin IA no responde");

    assert.equal(await queueWa(company.id, "809-555-0101", "aviso"), false, "sin WhatsApp conectado no se encola");
    await prisma.waSession.create({ data: { companyId: company.id, want: true, status: "CONNECTED" } });
    assert.equal(await queueWa(company.id, "809-555-0101", "aviso"), true);
    assert.equal((await prisma.waOutbox.findFirstOrThrow({ where: { companyId: company.id } })).phone, "18095550101");
    console.log("Avisos por WhatsApp (cola) OK");

    const bad = await internalRoute(new Request("http://x/api/internal/wa", { method: "POST", headers: { "x-wa-key": "malo" }, body: "{}" }));
    assert.equal(bad.status, 403);
    const good = await internalRoute(new Request("http://x/api/internal/wa", { method: "POST", headers: { "x-wa-key": internalKey(), "Content-Type": "application/json" }, body: JSON.stringify({ companyId: company.id, phone, text: "hola" }) }));
    assert.equal(good.status, 200);
    console.log("Ruta interna protegida OK");
    console.log("E2E WhatsApp OK");
  } finally {
    await prisma.waOutbox.deleteMany({ where: { companyId: company.id } });
    await prisma.waSession.deleteMany({ where: { companyId: company.id } });
    await prisma.waLink.deleteMany({ where: { companyId: company.id } });
    await prisma.aiConversation.deleteMany({ where: { companyId: company.id } });
    await prisma.aiCommandLog.deleteMany({ where: { companyId: company.id } });
    await prisma.aiConfirm.deleteMany({ where: { gpswoxUserId: client.id } });
    await prisma.aiPin.deleteMany({ where: { gpswoxUserId: client.id } });
    await prisma.notification.deleteMany({ where: { companyId: company.id } });
    await prisma.company.delete({ where: { id: company.id } });
    await prisma.mockClient.delete({ where: { id: client.id } });
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
