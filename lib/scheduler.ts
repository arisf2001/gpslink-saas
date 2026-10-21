import { runDailyLifecycle } from "./companies";
import { runDeviceAlerts } from "./device-status";

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
  setTimeout(run, 60_000);
  setTimeout(alerts, 90_000);
  setInterval(run, HOUR_MS);
  setInterval(alerts, HOUR_MS);
}
