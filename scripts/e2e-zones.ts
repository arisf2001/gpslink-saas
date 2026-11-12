import assert from "node:assert/strict";
import { mockCommands } from "../lib/ai/gps";
import { runBorderZones } from "../lib/border-zones";
import { prisma } from "../lib/db";
import { mockAdminCommands } from "../lib/gpswox";
import { handleIncoming, seal } from "../lib/wa";

const stamp = Date.now();

async function main() {
  assert.equal(process.env.GPSWOX_MODE, "mock");
  const plan = await prisma.plan.findFirstOrThrow();
  const rid = 800000 + (stamp % 100000);
  const company = await prisma.company.create({ data: { name: "Rastreo Frontera", slug: `frontera-${stamp}`, contactName: "T", email: `fr-${stamp}@x.com`, phone: "8095550299", passwordHash: "x", planId: plan.id, trialEndsAt: new Date(Date.now() + 864e5), status: "TRIAL", gpswoxUserId: rid, aiEnabled: true } });
  const client = await prisma.mockClient.create({ data: { managerId: rid, email: `fr-cliente-${stamp}@x.com` } });
  const dev = await prisma.mockDevice.create({ data: { gpswoxUserId: client.id, name: `Hilux BLE ${stamp}`, reportedAt: new Date(), lat: 18.47, lng: -69.9, speed: 50 } });
  await prisma.billedDevice.create({ data: { companyId: company.id, deviceId: dev.id, addedAt: new Date(), nextBillAt: new Date() } });
  await prisma.waSession.create({ data: { companyId: company.id, want: true, status: "CONNECTED" } });
  await prisma.waLink.create({ data: { companyId: company.id, phone: "18095550202", gpswoxUserId: client.id, hashSealed: seal(`mock:${client.email}`) } });
  const prevSetting = await prisma.alertSetting.findUnique({ where: { id: 1 } });
  await prisma.alertSetting.upsert({ where: { id: 1 }, create: { id: 1 }, update: { enabled: true, zonesEnabled: true, zoneCut: true } });
  const outbox = () => prisma.waOutbox.findMany({ where: { companyId: company.id, phone: "18095550202" }, orderBy: { id: "asc" } });
  const move = (lat: number, lng: number, speed: number) => prisma.mockDevice.update({ where: { id: dev.id }, data: { lat, lng, speed } });
  const mine = (list: { deviceId: number; type: string }[]) => list.filter((c) => c.deviceId === dev.id).map((c) => c.type);
  try {
    await runBorderZones();
    assert.equal((await outbox()).length, 0, "Santo Domingo: fuera de zonas");

    await move(19.55, -71.08, 80); // Mao
    await runBorderZones();
    let msgs = await outbox();
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].text, /Zona amarilla/);
    console.log("Amarilla OK >", msgs[0].text.replace(/\n/g, " | "));

    await move(18.877, -71.7, 60); // Elías Piña, rápido
    await runBorderZones();
    msgs = await outbox();
    assert.equal(msgs.length, 2);
    assert.match(msgs[1].text, /EMERGENCIA/);
    assert.match(msgs[1].text, /se apagará en cuanto baje a 20 km\/h/);
    assert.deepEqual(mine(mockAdminCommands), [], "no apaga a 60 km/h");
    console.log("Roja a 60 km/h OK >", msgs[1].text.replace(/\n/g, " | "));

    await move(18.877, -71.7, 15);
    const t0 = Date.now();
    await runBorderZones();
    assert.deepEqual(mine(mockAdminCommands), ["engineStop", "DY"]);
    assert.ok(Date.now() - t0 >= 9_900, "10 s entre motor y bomba");
    msgs = await outbox();
    assert.equal(msgs.length, 3);
    assert.match(msgs[2].text, /Se envió la orden de APAGAR/);
    assert.match(msgs[2].text, /responde ENCENDER/);
    console.log(`Apagado a 15 km/h OK (${Date.now() - t0} ms) >`, msgs[2].text.replace(/\n/g, " | "));

    await runBorderZones();
    assert.deepEqual(mine(mockAdminCommands), ["engineStop", "DY"], "no repite el apagado");

    const reply = await handleIncoming(company.id, "18095550202", "ENCENDER");
    assert.match(reply ?? "", /ENCENDER el motor/);
    assert.deepEqual(mine(mockCommands), ["engineResume", "KY"]);
    console.log("WhatsApp ENCENDER OK >", reply);
    await runBorderZones();
    assert.deepEqual(mine(mockAdminCommands), ["engineStop", "DY"], "no lo vuelve a apagar después de encenderlo");

    await move(18.47, -69.9, 70);
    await runBorderZones();
    msgs = await outbox();
    assert.match(msgs.at(-1)!.text, /salió de las zonas/i);
    console.log("Salida OK >", msgs.at(-1)!.text.replace(/\n/g, " | "));
    console.log("TODO OK");
  } finally {
    if (prevSetting) await prisma.alertSetting.update({ where: { id: 1 }, data: { enabled: prevSetting.enabled, zonesEnabled: prevSetting.zonesEnabled, zoneCut: prevSetting.zoneCut } });
    await prisma.borderZoneState.deleteMany({ where: { deviceId: dev.id } });
    await prisma.deviceAlert.deleteMany({ where: { deviceId: dev.id } });
    await prisma.waOutbox.deleteMany({ where: { companyId: company.id } });
    await prisma.waLink.deleteMany({ where: { companyId: company.id } });
    await prisma.waSession.deleteMany({ where: { companyId: company.id } });
    await prisma.billedDevice.deleteMany({ where: { companyId: company.id } });
    await prisma.mockDevice.delete({ where: { id: dev.id } });
    await prisma.mockClient.delete({ where: { id: client.id } });
    await prisma.company.delete({ where: { id: company.id } });
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
