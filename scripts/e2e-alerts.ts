import assert from "node:assert/strict";
import { prisma } from "../lib/db";
import { deviceStatuses, runDeviceAlerts } from "../lib/device-status";
import { seal } from "../lib/wa";

const stamp = Date.now();
const H = 3_600_000;

async function main() {
  assert.equal(process.env.GPSWOX_MODE, "mock");
  const plan = await prisma.plan.findFirstOrThrow();
  const rid = 700000 + (stamp % 100000);
  const company = await prisma.company.create({ data: { name: "Rastreo Alertas", slug: `alertas-${stamp}`, contactName: "T", email: `al-${stamp}@x.com`, phone: "8095550199", passwordHash: "x", planId: plan.id, trialEndsAt: new Date(Date.now() + 864e5), status: "TRIAL", gpswoxUserId: rid, aiEnabled: true } });
  const client = await prisma.mockClient.create({ data: { managerId: rid, email: `al-cliente-${stamp}@x.com` } });
  const dev = await prisma.mockDevice.create({ data: { gpswoxUserId: client.id, name: `Aveo ${stamp}`, other: "<info><charge>true</charge><batterylevel>90</batterylevel><rssi>4</rssi><sat>9</sat></info>", reportedAt: new Date() } });
  await prisma.billedDevice.create({ data: { companyId: company.id, deviceId: dev.id, addedAt: new Date(), nextBillAt: new Date() } });
  await prisma.waSession.create({ data: { companyId: company.id, want: true, status: "CONNECTED" } });
  await prisma.waLink.create({ data: { companyId: company.id, phone: "18095550102", gpswoxUserId: client.id, hashSealed: seal(`mock:${client.email}`) } });
  const prevSetting = await prisma.alertSetting.findUnique({ where: { id: 1 } });
  const prevRule = await prisma.notificationRule.findUnique({ where: { kind: "offline" } });
  await prisma.notificationRule.deleteMany({ where: { kind: { in: ["low_battery", "power_cut", "offline"] } } });
  await prisma.alertSetting.upsert({ where: { id: 1 }, create: { id: 1, enabled: true }, update: { enabled: true, lowBattery: 20, offlineHours: 24 } });
  const outbox = () => prisma.waOutbox.findMany({ where: { companyId: company.id }, orderBy: { id: "asc" } });
  try {
    const [s] = await deviceStatuses([dev.id]);
    assert.equal(s.battery, 90); assert.equal(s.signal, 4); assert.equal(s.satellites, 9); assert.equal(s.charging, true);
    console.log("Estado del equipo OK", JSON.stringify({ battery: s.battery, signal: s.signal, sat: s.satellites, charging: s.charging }));

    await runDeviceAlerts();
    assert.equal((await outbox()).length, 0, "la primera vez solo guarda el estado");
    console.log("Primera revisión: sin avisos (solo guarda el estado) OK");

    await prisma.mockDevice.update({ where: { id: dev.id }, data: { other: "<info><charge>false</charge><batterylevel>15</batterylevel><rssi>2</rssi></info>" } });
    await runDeviceAlerts();
    const msgs = await outbox();
    for (const m of msgs) console.log("  >", m.phone, m.text);
    assert.equal(msgs.filter((m) => m.phone === "18095550102").length, 2, "cliente: batería + corriente");
    assert.equal(msgs.filter((m) => m.phone === "18095550199").length, 2, "marca blanca: batería + corriente");
    assert.ok(msgs.some((m) => /batería baja \(15 %\)/.test(m.text)) && msgs.some((m) => /desconectó de la corriente/.test(m.text)));
    assert.ok(msgs.every((m) => m.text.includes("Aviso de Rastreo Alertas")));
    console.log("Batería baja y sin corriente -> cliente y marca blanca OK");

    await runDeviceAlerts();
    assert.equal((await outbox()).length, 4, "no se repite");
    console.log("Sin repetir OK");

    await prisma.notificationRule.create({ data: { kind: "offline", clientWa: true, brandWa: false } });
    await prisma.mockDevice.update({ where: { id: dev.id }, data: { reportedAt: new Date(Date.now() - 25 * H) } });
    await runDeviceAlerts();
    const off = (await outbox()).slice(4);
    assert.equal(off.length, 1, "sin reportar: solo al cliente (marca blanca desmarcada)");
    assert.equal(off[0].phone, "18095550102"); assert.match(off[0].text, /más de 24 horas sin reportar/);
    console.log("Sin reportar 24 h OK:", off[0].text);

    assert.equal(await prisma.deviceAlert.count({ where: { deviceId: dev.id } }), 3);
    console.log("Historial de avisos OK");
  } finally {
    await prisma.notificationRule.deleteMany({ where: { kind: "offline" } });
    if (prevRule) await prisma.notificationRule.create({ data: prevRule });
    await prisma.deviceAlert.deleteMany({ where: { deviceId: dev.id } });
    await prisma.deviceAlertState.deleteMany({ where: { deviceId: dev.id } });
    await prisma.waOutbox.deleteMany({ where: { companyId: company.id } });
    await prisma.waLink.deleteMany({ where: { companyId: company.id } });
    await prisma.waSession.deleteMany({ where: { companyId: company.id } });
    await prisma.mockDevice.delete({ where: { id: dev.id } });
    await prisma.mockClient.delete({ where: { id: client.id } });
    await prisma.company.delete({ where: { id: company.id } });
    if (prevSetting) await prisma.alertSetting.update({ where: { id: 1 }, data: { enabled: prevSetting.enabled, lowBattery: prevSetting.lowBattery, offlineHours: prevSetting.offlineHours } });
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
