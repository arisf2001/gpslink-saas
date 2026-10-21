import { runDailyLifecycle } from "./companies";

const HOUR_MS = 60 * 60 * 1000;

export function startLifecycleScheduler() {
  const run = () =>
    runDailyLifecycle()
      .then((s) => (s.reminders || s.blocked || s.errors) && console.log("[lifecycle]", JSON.stringify(s)))
      .catch((e) => console.error("[lifecycle] failed:", e));
  setTimeout(run, 60_000);
  setInterval(run, HOUR_MS);
}
