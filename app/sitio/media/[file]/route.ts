import { readImage } from "@/lib/site-media";

export async function GET(_req: Request, ctx: RouteContext<"/sitio/media/[file]">) {
  const { file } = await ctx.params;
  const img = await readImage(file);
  if (!img) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(img.body), {
    headers: {
      "Content-Type": img.type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
