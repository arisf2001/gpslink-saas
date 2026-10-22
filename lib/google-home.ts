import { verifyPin, type AiUser } from "./ai/assistant";
import * as gps from "./ai/gps";
import { prisma } from "./db";
import { deviceStatuses, type DeviceStatus } from "./device-status";
import { revokeByAccess } from "./oauth";

// Google Home cloud-to-cloud integration: each vehicle is a security panel (armed = engine blocked, PIN required),
// with query-only ignition (OnOff) and GPS battery (EnergyStorage) for routines. No location: Google Home has no trait for it.
type Input = { intent: string; payload?: { devices?: { id: string }[]; commands?: { devices: { id: string }[]; execution: { command: string; params?: { arm?: boolean }; challenge?: { pin?: string } }[] }[] } };
export type SmartHomeRequest = { requestId: string; inputs: Input[] };

const PANEL = "action.devices.types.SECURITYSYSTEM";
const TRAITS = ["action.devices.traits.ArmDisarm", "action.devices.traits.OnOff", "action.devices.traits.EnergyStorage"];

export function deviceFor(v: Pick<gps.Vehicle, "id" | "name" | "plate" | "group">) {
  return {
    id: String(v.id),
    type: PANEL,
    traits: TRAITS,
    name: { name: v.name, ...(v.plate ? { nicknames: [v.plate] } : {}) },
    willReportState: false,
    ...(v.group ? { roomHint: v.group } : {}),
    attributes: { queryOnlyOnOff: true, queryOnlyEnergyStorage: true, isRechargeable: false },
    deviceInfo: { manufacturer: "GPS Link", model: "GPS" },
  };
}

export function stateFor(v: Pick<gps.Vehicle, "online" | "engine">, s: Pick<DeviceStatus, "battery" | "blocked"> | undefined) {
  const battery = s?.battery ?? null;
  return {
    online: v.online !== "offline",
    status: "SUCCESS",
    isArmed: s?.blocked === true,
    on: v.engine === true,
    ...(battery === null
      ? {}
      : { capacityRemaining: [{ rawValue: Math.round(battery), unit: "PERCENTAGE" }], descriptiveCapacityRemaining: battery < 15 ? "CRITICALLY_LOW" : battery < 35 ? "LOW" : battery < 70 ? "MEDIUM" : battery < 95 ? "HIGH" : "FULL" }),
  };
}

export async function smartHome(req: SmartHomeRequest, user: AiUser, accessToken: string): Promise<Record<string, unknown>> {
  const input = req.inputs?.[0];
  const intent = input?.intent ?? "";
  if (intent === "action.devices.DISCONNECT") {
    await revokeByAccess(accessToken);
    return {};
  }
  let fleet = await gps.vehicles(user.hash);
  // The owner's admin user sees every client's device: Google Home gets only the vehicles he put in a group.
  if ((await gps.userInfo(user.hash)).groupId === 1) fleet = fleet.filter((v) => v.group);
  const mine = new Map(fleet.map((v) => [String(v.id), v]));
  if (intent === "action.devices.SYNC") {
    return { requestId: req.requestId, payload: { agentUserId: String(user.userId), devices: fleet.map(deviceFor) } };
  }
  if (intent === "action.devices.QUERY") {
    const ids = (input?.payload?.devices ?? []).map((d) => d.id).filter((id) => mine.has(id));
    const statuses = new Map((await deviceStatuses(ids.map(Number)).catch(() => [])).map((s) => [String(s.deviceId), s]));
    const devices: Record<string, unknown> = {};
    for (const d of input?.payload?.devices ?? []) {
      const v = mine.get(d.id);
      devices[d.id] = v ? stateFor(v, statuses.get(d.id)) : { status: "ERROR", errorCode: "deviceNotFound" };
    }
    return { requestId: req.requestId, payload: { devices } };
  }
  if (intent === "action.devices.EXECUTE") {
    const commands: Record<string, unknown>[] = [];
    for (const cmd of input?.payload?.commands ?? []) {
      for (const ex of cmd.execution) {
        for (const { id } of cmd.devices) {
          const v = mine.get(id);
          if (!v) { commands.push({ ids: [id], status: "ERROR", errorCode: "deviceNotFound" }); continue; }
          if (ex.command !== "action.devices.commands.ArmDisarm") { commands.push({ ids: [id], status: "ERROR", errorCode: "functionNotSupported" }); continue; }
          const lock = ex.params?.arm === true;
          const pin = ex.challenge?.pin;
          if (!pin) { commands.push({ ids: [id], status: "ERROR", errorCode: "challengeNeeded", challengeNeeded: { type: "pinNeeded" } }); continue; }
          const check = await verifyPin(user.userId, String(pin));
          if (check === "none") { commands.push({ ids: [id], status: "ERROR", errorCode: "authFailure" }); continue; }
          if (check === "locked") { commands.push({ ids: [id], status: "ERROR", errorCode: "tooManyFailedAttempts" }); continue; }
          if (check === "wrong") { commands.push({ ids: [id], status: "ERROR", errorCode: "challengeNeeded", challengeNeeded: { type: "challengeFailedPinNeeded" } }); continue; }
          const command: gps.EngineCommand = lock ? "engine_stop" : "engine_resume";
          let result: { ok: boolean; error?: string };
          try {
            result = (await gps.supportsCommand(user.hash, v.id, command)) ? await gps.sendCommand(user.hash, v.id, command) : { ok: false, error: "not supported" };
          } catch (e) {
            result = { ok: false, error: e instanceof Error ? e.message : String(e) };
          }
          await prisma.aiCommandLog.create({ data: { gpswoxUserId: user.userId, companyId: user.company?.id ?? null, deviceId: v.id, deviceName: v.name, command, channel: "google", ok: result.ok, error: result.error ?? null } });
          commands.push(result.ok ? { ids: [id], status: "SUCCESS", states: { isArmed: lock, online: true } } : { ids: [id], status: "ERROR", errorCode: result.error === "not supported" ? "functionNotSupported" : "transientError" });
        }
      }
    }
    return { requestId: req.requestId, payload: { commands } };
  }
  return { requestId: req.requestId, payload: { errorCode: "notSupported" } };
}
