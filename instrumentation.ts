export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production" && process.env.DISABLE_SCHEDULER !== "1") {
    const { startLifecycleScheduler } = await import("./lib/scheduler");
    startLifecycleScheduler();
  }
}
