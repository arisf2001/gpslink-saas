import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { ensureDefaultPlans } from "@/lib/plans";
import { markInvoicePaid, registerCompany, runDailyLifecycle, syncDevices } from "@/lib/companies";

const D = (s: string) => new Date(s);
async function main() {
  await prisma.company.deleteMany({ where: { email: { startsWith: "e2e-" } } });
  await ensureDefaultPlans();
  const prices: Record<number, number> = { 1: 600, 26: 550, 51: 525, 101: 500 };
  for (const t of await prisma.priceTier.findMany()) await prisma.priceTier.update({ where: { id: t.id }, data: { priceCents: prices[t.minDevices] ?? 0 } });
  const plan = await prisma.plan.findFirstOrThrow({ where: { devices: 50 } });
  const c0 = await registerCompany({ name: "E2E Rastreo", slug: `e2e${Date.now()}`, contactName: "Prueba", email: `e2e-${Date.now()}@x.com`, phone: "18095550000", password: "Abcdef123", planId: plan.id }, D("2026-11-05T15:00:00Z"));
  console.log("trial ends", c0.trialEndsAt.toISOString(), "limit", c0.deviceLimit);
  const add = async (n: number, at: string) => { await prisma.mockDevice.createMany({ data: Array.from({ length: n }, () => ({ gpswoxUserId: c0.gpswoxUserId!, createdAt: D(at) })) }); };
  const run = async (at: string) => { const s = await runDailyLifecycle(D(at)); const c = await prisma.company.findUniqueOrThrow({ where: { id: c0.id }, include: { invoices: { orderBy: { periodStart: "asc" } } } }); console.log(at, JSON.stringify(s), c.status, c.invoices.map((i) => `${i.devices}d(${i.newDevices}n/${i.renewals}r)@${i.unitPriceCents}=${i.amountCents} ${i.status} due ${i.dueAt.toISOString()}`).join(" | ")); return c; };

  await add(3, "2026-11-10T15:00:00Z"); await add(2, "2026-12-20T15:00:00Z");
  let c = await run("2026-12-01T12:00:00Z"); assert.equal(c.invoices.length, 0);
  c = await run("2027-01-01T12:00:00Z"); assert.equal(c.invoices.length, 0);
  c = await run("2027-01-31T16:00:00Z");
  c = await run("2027-02-01T12:00:00Z"); assert.equal(c.invoices.length, 0);
  await add(1, "2027-02-10T15:00:00Z");
  c = await run("2027-03-01T05:00:00Z"); assert.equal(c.invoices.length, 1); assert.equal(c.invoices[0].amountCents, 6 * 600); assert.equal(c.status, "ACTIVE");
  c = await run("2027-03-01T18:00:00Z"); assert.equal(c.invoices.length, 1);
  for (const d of ["2027-03-13T12:00:00Z", "2027-03-14T12:00:00Z", "2027-03-15T12:00:00Z"]) c = await run(d);
  assert.equal(c.status, "ACTIVE");
  c = await run("2027-03-16T05:00:00Z"); assert.equal(c.status, "BLOCKED");
  const ref = `test_${Date.now()}`;
  await markInvoicePaid(c.invoices[0].id, { method: "deposito", reference: ref }, D("2027-03-17T12:00:00Z"));
  assert.equal(await markInvoicePaid(c.invoices[0].id, { method: "deposito", reference: ref }), null);
  c = await prisma.company.findUniqueOrThrow({ where: { id: c0.id }, include: { invoices: true } }); assert.equal(c.status, "ACTIVE");
  c = await run("2027-04-01T12:00:00Z"); assert.equal(c.invoices.length, 1);
  // one device removed in GPSWOX: not renewed
  const gone = await prisma.mockDevice.findFirstOrThrow({ where: { gpswoxUserId: c0.gpswoxUserId! } });
  await prisma.mockDevice.delete({ where: { id: gone.id } }); await syncDevices(c, D("2027-06-01T12:00:00Z"));
  c = await run("2028-03-01T12:00:00Z"); assert.equal(c.invoices.length, 2); assert.equal(c.invoices[1].devices, 5); assert.equal(c.invoices[1].renewals, 5);
  const notes = await prisma.notification.findMany({ where: { companyId: c0.id }, orderBy: { createdAt: "asc" } });
  console.log("avisos:", notes.map((n) => n.kind).join(", "));
  await prisma.company.delete({ where: { id: c0.id } });
  console.log("OK");
}
main().finally(() => prisma.$disconnect());
