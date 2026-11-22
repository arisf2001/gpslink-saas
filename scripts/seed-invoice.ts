import { prisma } from "@/lib/db";
import { ensureDefaultPlans } from "@/lib/plans";
import { registerCompany, runDailyLifecycle } from "@/lib/companies";

async function main() {
  await ensureDefaultPlans();
  const plan = await prisma.plan.findFirstOrThrow({ where: { devices: 100 } });
  for (const email of ["factura-a@prueba.com", "factura-b@prueba.com"]) {
    await prisma.company.deleteMany({ where: { email } });
    const c = await registerCompany({ name: email.startsWith("factura-a") ? "Rastreo Factura A" : "Rastreo Factura B", slug: email.slice(0, 9), contactName: "Prueba", email, phone: "18095550000", password: "Abcdef123", planId: plan.id }, new Date("2026-05-01T15:00:00Z"));
    await prisma.company.update({ where: { id: c.id }, data: { createdAt: new Date("2026-05-01T15:00:00Z") } });
    await prisma.mockDevice.createMany({ data: Array.from({ length: 30 }, (_, i) => ({ gpswoxUserId: c.gpswoxUserId!, createdAt: new Date(Date.UTC(2026, 4, 10 + (i % 20), 15)) })) });
  }
  console.log(await runDailyLifecycle());
}
main().finally(() => prisma.$disconnect());
