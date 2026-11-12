import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { ensureDefaultPlans } from "@/lib/plans";
import { registerCompany } from "@/lib/companies";
import { SubDistributorError, createSubDistributor, syncClients } from "@/lib/clients";

async function main() {
  await prisma.company.deleteMany({ where: { email: { startsWith: "e2es-" } } });
  await ensureDefaultPlans();
  const plan = await prisma.plan.findFirstOrThrow({ where: { devices: 50 } });
  const company = await registerCompany({ name: "E2E Sub", slug: `e2es${Date.now()}`, contactName: "Prueba", email: `e2es-${Date.now()}@x.com`, phone: "18095550000", password: "Abcdef123", planId: plan.id });
  const tag = Date.now();
  await assert.rejects(createSubDistributor(company, { email: "malo", phone: "", devicesLimit: 5 }), (e) => e instanceof SubDistributorError && e.message === "correo");
  await assert.rejects(createSubDistributor(company, { email: `a${tag}@x.com`, phone: "", devicesLimit: company.deviceLimit + 1 }), (e) => e instanceof SubDistributorError && e.message === "limite");
  const sub = await createSubDistributor(company, { email: `sub${tag}@x.com`, phone: "8095551234", devicesLimit: 10 });
  assert.equal(sub.isDealer, true);
  const mc = await prisma.mockClient.findUniqueOrThrow({ where: { id: sub.gpswoxUserId } });
  assert.equal(mc.groupId, 3);
  assert.equal(mc.managerId, company.gpswoxUserId);
  await prisma.mockClient.create({ data: { email: `cli${tag}@x.com`, managerId: mc.id, groupId: 2 } });
  await syncClients(company);
  const list = await prisma.endClient.findMany({ where: { companyId: company.id } });
  assert.equal(list.length, 2, "parent sees the sub-distributor and its client");
  assert.equal(list.find((c) => c.email.startsWith("cli"))!.managerId, mc.id);
  console.log("E2E subdistribuidor OK");
}
main().finally(() => prisma.$disconnect());
