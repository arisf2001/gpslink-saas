import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";
import { seal, unseal } from "./wa";

const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export async function siriToken(userId: number): Promise<string | null> {
  const row = await prisma.siriKey.findUnique({ where: { gpswoxUserId: userId } });
  return unseal(row?.tokenSealed);
}

export async function newSiriToken(userId: number, hash: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  const data = { tokenHash: digest(token), tokenSealed: seal(token), hashSealed: seal(hash), conversationId: null, lastUsedAt: null };
  await prisma.siriKey.upsert({ where: { gpswoxUserId: userId }, create: { gpswoxUserId: userId, ...data }, update: data });
  return token;
}

export async function siriKeyFor(token: string) {
  if (token.length < 20) return null;
  const row = await prisma.siriKey.findUnique({ where: { tokenHash: digest(token) } });
  const hash = unseal(row?.hashSealed);
  return row && hash ? { ...row, hash } : null;
}
