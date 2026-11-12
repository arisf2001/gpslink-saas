import { normalizeSubdomain } from "@/lib/brand-web";
import { appUrl } from "@/lib/config";
import { resourceUrl } from "@/lib/mcp";

export async function GET(_req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const path = (await params).path ?? [];
  const brand = path[0] === "mcp" && path[1] ? normalizeSubdomain(path[1]) : null;
  return Response.json(
    { resource: resourceUrl(brand), authorization_servers: [appUrl()], scopes_supported: ["vehicles"], bearer_methods_supported: ["header"], resource_name: "GPS Link" },
    { headers: { "Access-Control-Allow-Origin": "*" } },
  );
}
