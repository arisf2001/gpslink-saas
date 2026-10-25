import { runDailyLifecycle } from "./companies";
import { runDeviceAlerts } from "./device-status";
import { runSims } from "./sim/notify";
import { runActivations } from "./activation";
import { runEventNotifications } from "./notifications";
import { runBorderZones } from "./border-zones";
import { runRedZones } from "./red-zones";

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
      .then((s) => (s.synced?.created || s.synced?.changed || s.esim || s.profiles || s.notices || s.report) && console.log("[sim]", JSON.stringify(s)))
      .catch((e) => console.error("[sim] failed:", e));
  const activations = () =>
    runActivations()
      .then((s) => (s.signaled || s.activated) && console.log("[activacion]", JSON.stringify(s)))
      .catch((e) => console.error("[activacion] failed:", e));
  const events = () =>
    runEventNotifications()
      .then((s) => s.sent && console.log("[eventos]", JSON.stringify(s)))
      .catch((e) => console.error("[eventos] failed:", e));
  const zones = () =>
    runBorderZones()
      .then((s) => (s.notices || s.cuts) && console.log("[zonas]", JSON.stringify(s)))
      .catch((e) => console.error("[zonas] failed:", e));
  const redZones = () =>
    runRedZones()
      .then((s) => (s.notices || s.cuts) && console.log("[zonas-rojas]", JSON.stringify(s)))
      .catch((e) => console.error("[zonas-rojas] failed:", e));
  setTimeout(zones, 80_000);
  setInterval(zones, 60_000);
  setTimeout(redZones, 95_000);
  setInterval(redZones, 60_000);
  setTimeout(events, 110_000);
  setInterval(events, 2 * 60_000);
  setTimeout(activations, 100_000);
  setInterval(activations, 15 * 60_000);
  setTimeout(run, 60_000);
  setTimeout(sims, 120_000);
  setInterval(sims, HOUR_MS);
  setTimeout(alerts, 90_000);
  setInterval(run, HOUR_MS);
  setInterval(alerts, HOUR_MS);
}
