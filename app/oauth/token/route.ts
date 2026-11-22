import { exchange } from "@/lib/oauth";

function basicAuth(req: Request): { id: string; secret: string } | null {
  const m = /^Basic\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return null;
  const [id, ...rest] = Buffer.from(m[1], "base64").toString().split(":");
  return { id: decodeURIComponent(id), secret: decodeURIComponent(rest.join(":")) };
}

export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  const params = type.includes("application/json")
    ? new URLSearchParams(Object.entries((await req.json().catch(() => ({}))) as Record<string, string>).map(([k, v]) => [k, String(v)]))
    : new URLSearchParams(await req.text());
  const result = await exchange(params, basicAuth(req));
  const headers = { "Cache-Control": "no-store", Pragma: "no-cache" };
  if ("error" in result) return Response.json(result, { status: result.error === "invalid_client" ? 401 : 400, headers });
  return Response.json(result, { headers });
}
