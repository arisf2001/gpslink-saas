import { runDailyLifecycle } from "./companies";
import { runDeviceAlerts } from "./device-status";
import { runSims } from "./sim/notify";
import { runActivations } from "./activation";

const HOUR_MS = 60 * 60 * 1000;

export function startLifecycleScheduler() {
  const run = () =>
    runDailyLifecycle()
      .then((s) => (s.reminders || s.blocked || s.invoices || s.clientReminders || s.clientsBlocked || s.errors) && console.log("[lifecycle]", JSON.stringify(s)))
      .catch((e) => console.error("[lifecycle] failed:", e));
  const alerts = () =>
    runDeviceAlerts()
      .then((s) => s.fired && console.log("[alertas]", JSON.stringify(s)))
      .catch((e) => console.error("[alertas] failed:", e));
  const sims = () =>
    runSims()
      .then((s) => (s.synced?.created || s.synced?.changed || s.notices || s.report) && console.log("[sim]", JSON.stringify(s)))
      .catch((e) => console.error("[sim] failed:", e));
  const activations = () =>
    runActivations()
      .then((s) => (s.signaled || s.activated) && console.log("[activacion]", JSON.stringify(s)))
      .catch((e) => console.error("[activacion] failed:", e));
  setTimeout(activations, 100_000);
  setInterval(activations, 15 * 60_000);
  setTimeout(run, 60_000);
  setTimeout(sims, 120_000);
  setInterval(sims, HOUR_MS);
  setTimeout(alerts, 90_000);
  setInterval(run, HOUR_MS);
  setInterval(alerts, HOUR_MS);
}
