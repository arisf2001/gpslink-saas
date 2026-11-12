import assert from "node:assert/strict";
import { prisma } from "../lib/db";
import { hashKey } from "../lib/ai/http";
import { mockCommands } from "../lib/ai/gps";
import { createInvoice } from "../lib/companies";
import { GET as configRoute } from "../app/api/ia/v1/config/route";
import { POST as chatRoute } from "../app/api/ia/v1/chat/route";
import { POST as confirmRoute } from "../app/api/ia/v1/confirm/route";
import { POST as pinRoute } from "../app/api/ia/v1/pin/route";

const stamp = Date.now();
const KEY = `glk_test_${stamp}`;
const base = "http://local/api/ia/v1";

async function post(fn: (r: Request) => Promise<Response>, path: string, body: Record<string, unknown>, key = KEY) {
  const res = await fn(new Request(`${base}/${path}`, { method: "POST", headers: { "Content-Type": "application/json", "X-App-Key": key }, body: JSON.stringify(body) }));
  return { status: res.status, data: await res.json() };
}

async function main() {
  assert.equal(process.env.GPSWOX_MODE, "mock");
  const plan = await prisma.plan.findFirstOrThrow();
  const resellerId = 700000 + (stamp % 100000);
  const mk = (name: string, gpswoxUserId: number, aiEnabled: boolean) =>
    prisma.company.create({ data: { name, slug: `${name}-${stamp}`.toLowerCase().replace(/\W+/g, "-"), contactName: "T", email: `${name.toLowerCase()}-${stamp}@x.com`, phone: "0", passwordHash: "x", planId: plan.id, trialEndsAt: new Date(Date.now() - 864e5), status: "ACTIVE", gpswoxUserId, aiEnabled } });
  const company = await mk("Rastreo IA", resellerId, true);
  const other = await mk("Sin IA", resellerId + 1, false);
  const dealer = await prisma.mockClient.create({ data: { managerId: resellerId, email: `dealer-${stamp}@x.com`, groupId: 3 } });
  const client = await prisma.mockClient.create({ data: { managerId: dealer.id, email: `cliente-${stamp}@x.com` } });
  const outsider = await prisma.mockClient.create({ data: { managerId: resellerId + 1, email: `otro-${stamp}@x.com` } });
  const key = await prisma.aiAppKey.create({ data: { name: "test", prefix: KEY.slice(0, 8), keyHash: hashKey(KEY) } });
  const hash = `mock:${client.email}`;
  try {
    const cfg = await configRoute(new Request(`${base}/config?user_api_hash=${encodeURIComponent(hash)}`, { headers: { "X-App-Key": KEY } }));
    const cfgData = await cfg.json();
    assert.equal(cfg.status, 200);
    assert.equal(cfgData.enabled, true);
    assert.equal(cfgData.assistant_name, "Asistente Rastreo IA");
    assert.equal(cfgData.has_pin, false);
    console.log("config OK (cliente de un dealer -> marca blanca correcta)");

    let r = await post(chatRoute, "chat", { user_api_hash: hash, message: "¿Dónde está el Aveo?", lang: "es" });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    console.log("  >", r.data.reply);
    assert.match(r.data.reply, /27 de Febrero/i);
    assert.ok(r.data.actions.some((a: { type: string }) => a.type === "street_view"));
    const conv = r.data.conversation_id;

    r = await post(chatRoute, "chat", { user_api_hash: hash, conversation_id: conv, message: "¿Qué recorrido hizo ayer el camión?", lang: "es" });
    console.log("  >", r.data.reply);
    assert.ok(r.data.actions.some((a: { type: string }) => a.type === "open_history"), "open_history");

    r = await post(chatRoute, "chat", { user_api_hash: hash, conversation_id: conv, message: "Apaga el motor del Aveo", lang: "es" });
    console.log("  >", r.data.reply);
    assert.equal(r.data.confirm, null, "sin PIN no debe preparar la orden");
    assert.match(r.data.reply, /PIN/);

    assert.equal((await post(pinRoute, "pin", { user_api_hash: hash, password: "mala", pin: "1234" })).data.ok, false);
    assert.equal((await post(pinRoute, "pin", { user_api_hash: hash, password: "mockpass", pin: "12" })).data.ok, false);
    assert.equal((await post(pinRoute, "pin", { user_api_hash: hash, password: "mockpass", pin: "4821" })).data.ok, true);
    console.log("PIN OK (pide contraseña, valida formato)");

    r = await post(chatRoute, "chat", { user_api_hash: hash, conversation_id: conv, message: "Ya tengo el PIN. Apaga el motor del Aveo.", lang: "es" });
    console.log("  >", r.data.reply);
    assert.ok(r.data.confirm, JSON.stringify(r.data));
    assert.equal(r.data.confirm.command, "engine_stop");
    assert.equal(r.data.confirm.device_id, 9001);
    assert.equal(mockCommands.length, 0, "chat no ejecuta");
    const token = r.data.confirm.token;

    let c = await post(confirmRoute, "confirm", { user_api_hash: hash, token, pin: "0000" });
    assert.equal(c.data.ok, false);
    assert.match(c.data.reply, /quedan 2/);
    const stranger = await post(confirmRoute, "confirm", { user_api_hash: `mock:${outsider.email}`, token, pin: "4821" });
    assert.notEqual(stranger.data.ok, true, "otro usuario no puede usar el token");
    c = await post(confirmRoute, "confirm", { user_api_hash: hash, token, pin: "4821" });
    assert.equal(c.data.ok, true, JSON.stringify(c.data));
    assert.deepEqual(mockCommands, [{ deviceId: 9001, type: "engineStop" }]);
    c = await post(confirmRoute, "confirm", { user_api_hash: hash, token, pin: "4821" });
    assert.equal(c.data.ok, false, "token de un solo uso");
    console.log("Confirmación OK (PIN incorrecto, otro usuario, un solo uso)", c.data.reply);

    assert.equal((await post(chatRoute, "chat", { user_api_hash: `mock:${outsider.email}`, message: "hola" })).status, 403, "marca blanca sin IA");
    assert.equal((await post(chatRoute, "chat", { user_api_hash: hash, message: "hola" }, "glk_falsa")).status, 403, "llave falsa");
    assert.equal((await post(chatRoute, "chat", { user_api_hash: "malo", message: "hola" })).status, 401, "sesión inválida");
    await prisma.aiAppKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    assert.equal((await post(chatRoute, "chat", { user_api_hash: hash, message: "hola" })).status, 403, "llave desactivada");
    console.log("Aislamiento OK (sin IA 403, llave falsa/desactivada 403, sesión mala 401)");

    const before = await prisma.aiSetting.findUnique({ where: { id: 1 } });
    await prisma.aiSetting.upsert({ where: { id: 1 }, create: { id: 1, monthlyPriceCents: 1500 }, update: { monthlyPriceCents: 1500 } });
    const later = new Date(Date.now() + 40 * 864e5);
    const inv = await createInvoice(company, later);
    assert.ok(inv && inv.aiCents === 1500 && inv.amountCents === 1500, JSON.stringify(inv));
    assert.equal(await createInvoice(other, later), null, "sin IA y sin equipos no se factura");
    await prisma.aiSetting.update({ where: { id: 1 }, data: { monthlyPriceCents: before?.monthlyPriceCents ?? 0 } });
    console.log("Factura OK: IA US$15 sumada a la factura del mes");
    console.log("E2E IA OK");
  } finally {
    await prisma.aiConversation.deleteMany({ where: { companyId: { in: [company.id, other.id] } } });
    await prisma.aiCommandLog.deleteMany({ where: { companyId: company.id } });
    await prisma.aiPin.deleteMany({ where: { gpswoxUserId: client.id } });
    await prisma.aiConfirm.deleteMany({ where: { gpswoxUserId: { in: [client.id, outsider.id] } } });
    await prisma.aiAppKey.delete({ where: { id: key.id } });
    await prisma.notification.deleteMany({ where: { companyId: { in: [company.id, other.id] } } });
    await prisma.company.deleteMany({ where: { id: { in: [company.id, other.id] } } });
    await prisma.mockClient.deleteMany({ where: { id: { in: [dealer.id, client.id, outsider.id] } } });
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
