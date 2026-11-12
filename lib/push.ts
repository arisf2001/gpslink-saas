import webpush from "web-push";
import { prisma } from "./db";

export type PushMessage = { title: string; body: string; url?: string; tag?: string };
export type PushInput = { endpoint: string; keys: { p256dh: string; auth: string } };

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? "";

let ready = false;
function configured(): boolean {
  if (ready) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:info@gpslinkusa.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return (ready = true);
}

export function parseSubscription(value: unknown): PushInput | null {
  const v = value as Partial<PushInput> | null;
  const endpoint = typeof v?.endpoint === "string" ? v.endpoint : "";
  const { p256dh, auth } = v?.keys ?? ({} as PushInput["keys"]);
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 700 || typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) return null;
  return { endpoint, keys: { p256dh, auth } };
}

export async function saveSubscription(sub: PushInput, scope: "admin" | "track", gpswoxUserId: number | null, origin: string | null) {
  const data = { p256dh: sub.keys.p256dh, auth: sub.keys.auth, scope, gpswoxUserId, origin };
  await prisma.pushSub.upsert({ where: { endpoint: sub.endpoint }, create: { endpoint: sub.endpoint, ...data }, update: data });
}

async function sendTo(where: { scope: string; gpswoxUserId?: number }, msg: PushMessage): Promise<number> {
  if (!configured()) return 0;
  const subs = await prisma.pushSub.findMany({ where });
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      const url = msg.url ?? (s.origin ? `${s.origin}/` : "/admin");
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...msg, url }), { TTL: 3600 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await prisma.pushSub.delete({ where: { id: s.id } }).catch(() => null);
        else console.error("[push]", code ?? (e as Error).message);
      }
    }),
  );
  return sent;
}

// Never throws: a failed push must not stop the email/WhatsApp that triggered it.
export const pushAdmin = (msg: PushMessage) => sendTo({ scope: "admin" }, msg).catch(() => 0);
export const pushTrackUser = (gpswoxUserId: number, msg: PushMessage) => sendTo({ scope: "track", gpswoxUserId }, msg).catch(() => 0);
