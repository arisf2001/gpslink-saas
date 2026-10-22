import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { appUrl } from "@/lib/config";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  ico: "image/x-icon",
};
function sniff(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b.toString("ascii", 1, 4) === "PNG") return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.toString("ascii", 0, 4) === "GIF8") return "gif";
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return "ico";
  return null;
}
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const NAME = /^[a-z0-9]+-[a-f0-9]{16}\.(png|jpg|webp|gif|ico)$/;

function mediaDir(): string {
  return process.env.SITE_MEDIA_DIR ?? path.join(process.cwd(), "data", "site-media");
}

export function mediaUrl(file: string): string {
  return file ? `${appUrl()}/sitio/media/${file}` : "";
}

export class ImageError extends Error {}

export async function saveImage(companyId: string, file: File): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) throw new ImageError("grande");
  const body = Buffer.from(await file.arrayBuffer());
  const ext = sniff(body);
  if (!ext) throw new ImageError("tipo");
  const name = `${companyId.toLowerCase().replace(/[^a-z0-9]/g, "")}-${randomBytes(8).toString("hex")}.${ext}`;
  await mkdir(mediaDir(), { recursive: true });
  await writeFile(path.join(mediaDir(), name), body);
  return name;
}

export async function readImage(name: string): Promise<{ body: Buffer; type: string } | null> {
  if (!NAME.test(name)) return null;
  try {
    const body = await readFile(path.join(mediaDir(), name));
    return { body, type: TYPES[name.split(".").pop() as string] };
  } catch {
    return null;
  }
}
