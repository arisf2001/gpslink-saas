import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { ensureDefaultPlans } from "@/lib/plans";
import { registerCompany, runDailyLifecycle } from "@/lib/companies";
import { blockClient, registerClientPayment, setClientPlan, syncClients, unblockClient } from "@/lib/clients";

const D = (s: string) => new Date(s);
async function main() {
  await prisma.company.deleteMany({ where: { email: { startsWith: "e2ec-" } } });
  await ensureDefaultPlans();
  const plan = await prisma.plan.findFirstOrThrow({ where: { devices: 50 } });
  const company = await registerCompany({ name: "E2E Clientes", slug: `e2ec${Date.now()}`, contactName: "Prueba", email: `e2ec-${Date.now()}@x.com`, phone: "18095550000", password: "Abcdef123", planId: plan.id }, D("2026-11-01T15:00:00Z"));
  const root = company.gpswoxUserId!;
  const mk = async (email: string, managerId: number, groupId: number, devices: number) => {
    const m = await prisma.mockClient.create({ data: { email, managerId, groupId } });
    if (devices) await prisma.mockDevice.createMany({ data: Array.from({ length: devices }, () => ({ gpswoxUserId: m.id, createdAt: D("2026-11-02T15:00:00Z") })) });
    return m;
  };
  const tag = Date.now();
  await mk(`ana${tag}@x.com`, root, 2, 2);
  const dealer = await mk(`dealer${tag}@x.com`, root, 3, 1);
  await mk(`sub${tag}@x.com`, dealer.id, 2, 3);
  await syncClients(company);
  const list = await prisma.endClient.findMany({ where: { companyId: company.id } });
  const by = (p: string) => list.find((c) => c.email.startsWith(p))!;
  assert.equal(list.length, 3);
  assert.equal(by("dealer").devices, 4, "dealer counts its clients' devices");
  assert.equal(by("sub").managerId, dealer.id);
  assert.equal(by("ana").managerId, null);

  const cp = await prisma.clientPlan.create({ data: { companyId: company.id, name: "Anual", priceCents: 39500, currency: "dop", months: 12 } });
  await setClientPlan(by("ana"), cp.id, D("2026-12-10T03:59:00Z"));
  await setClientPlan(by("dealer"), cp.id, D("2026-12-20T03:59:00Z"));

  for (const d of ["2026-12-06T13:00:00Z", "2026-12-07T13:00:00Z", "2026-12-08T13:00:00Z", "2026-12-09T13:00:00Z", "2026-12-09T20:00:00Z"]) await runDailyLifecycle(D(d));
  const notices = await prisma.clientNotice.findMany({ where: { endClient: { companyId: company.id } } });
  assert.deepEqual(notices.map((n) => n.kind).sort(), ["due_1", "due_2", "due_3"]);

  await runDailyLifecycle(D("2026-12-10T13:00:00Z"));
  let ana = await prisma.endClient.findUniqueOrThrow({ where: { id: by("ana").id }, include: { plan: true } });
  assert.equal(ana.blockReason, "expired");
  assert.equal((await prisma.mockClient.findFirstOrThrow({ where: { email: ana.email } })).active, false);
  assert.equal(await unblockClient(ana, D("2026-12-10T14:00:00Z")), false, "cannot unblock while expired");

  await registerClientPayment(company, ana, { periods: 1, amountCents: 79000, method: "efectivo" }, D("2026-12-11T15:00:00Z"));
  ana = await prisma.endClient.findUniqueOrThrow({ where: { id: ana.id }, include: { plan: true } });
  assert.equal(ana.blockReason, null);
  assert.equal(ana.paidUntil!.toISOString().slice(0, 10), "2027-12-11");
  assert.equal((await prisma.mockClient.findFirstOrThrow({ where: { email: ana.email } })).active, true);

  await runDailyLifecycle(D("2026-12-20T13:00:00Z"));
  const sub = await prisma.endClient.findUniqueOrThrow({ where: { id: by("sub").id } });
  assert.equal(sub.blockReason, "dealer", "dealer's client blocked with the dealer");
  const dl = await prisma.endClient.findUniqueOrThrow({ where: { id: by("dealer").id }, include: { plan: true } });
  await registerClientPayment(company, dl, { periods: 2, amountCents: 316000, method: "deposito" }, D("2026-12-21T15:00:00Z"));
  assert.equal((await prisma.endClient.findUniqueOrThrow({ where: { id: sub.id } })).blockReason, null);
  assert.equal((await prisma.endClient.findUniqueOrThrow({ where: { id: dl.id } })).paidUntil!.toISOString().slice(0, 10), "2028-12-21");

  await blockClient(company, ana, "manual");
  await runDailyLifecycle(D("2026-12-22T13:00:00Z"));
  assert.equal((await prisma.endClient.findUniqueOrThrow({ where: { id: ana.id } })).blockReason, "manual");
  assert.equal(await unblockClient((await prisma.endClient.findUniqueOrThrow({ where: { id: ana.id } }))), true);

  const billed = await prisma.billedDevice.count({ where: { companyId: company.id } });
  assert.equal(billed, 6, "white label is billed for every device below it, dealers included");
  console.log("avisos:", (await prisma.clientNotice.findMany({ where: { endClient: { companyId: company.id } }, orderBy: { createdAt: "asc" } })).map((n) => n.kind).join(", "));
  await prisma.company.delete({ where: { id: company.id } });
  console.log("E2E clientes OK");
}
main().finally(() => prisma.$disconnect());
