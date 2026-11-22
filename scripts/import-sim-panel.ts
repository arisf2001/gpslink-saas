// Imports the Telebay panel card list (JSON array from admin.telebay.cn sys/zycard/page).
// Adds the cards the open API doesn't return (assigned to Telebay sub-customers) and fills empty nicknames from panel remarks.
// Usage: npx tsx scripts/import-sim-panel.ts cards.json
import { readFileSync } from "node:fs";
import { prisma } from "../lib/db";
import { applyCards, devicesWithSim } from "../lib/sim/sync";
import type { TelebayCard } from "../lib/sim/telebay";

type PanelCard = {
  iccid: string;
  remark?: string | null;
  customerName?: string | null;
  status: number;
  imei: string | null;
  imsi: string | null;
  msisdn: string | null;
  platformActivationTime: string | null;
  totalFlow: number;
  usedFlow: number;
  countryName: string | null;
  endTime: string | null;
};

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Uso: npx tsx scripts/import-sim-panel.ts cards.json");
  const panel = JSON.parse(readFileSync(file, "utf8")) as PanelCard[];
  const fromApi = new Set((await prisma.simCard.findMany({ where: { panelOnly: false }, select: { iccid: true } })).map((c) => c.iccid));
  const missing = panel.filter((c) => c.iccid && !fromApi.has(c.iccid));
  const cards: TelebayCard[] = missing.map((c) => ({
    iccid: c.iccid,
    imei: c.imei,
    imsi: c.imsi,
    msisdn: c.msisdn,
    activationTime: c.platformActivationTime,
    status: c.status,
    totalFlow: c.totalFlow,
    usedFlow: c.usedFlow,
    countryName: c.countryName,
    endTime: c.endTime,
    zyCardPackageDTO: null,
  }));
  const summary = await applyCards(cards, "telebay", await devicesWithSim());
  for (const c of missing) {
    await prisma.simCard.update({ where: { iccid: c.iccid }, data: { panelOnly: true, tbCustomer: c.customerName || null, packageName: c.totalFlow > 0 ? `${c.totalFlow} MB` : null } });
  }
  let nicknames = 0;
  for (const c of panel) {
    const nickname = c.remark?.replace(/\s*\n\s*/g, " · ").trim().slice(0, 190);
    if (nickname) nicknames += (await prisma.simCard.updateMany({ where: { iccid: c.iccid, nickname: null }, data: { nickname } })).count;
  }
  console.log({ ...summary, panelOnly: missing.length, nicknames });
}

main().finally(() => prisma.$disconnect());
