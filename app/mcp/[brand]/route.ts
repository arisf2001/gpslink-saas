import { normalizeSubdomain } from "@/lib/brand-web";
import { handleMcp, mcpNotAllowed } from "@/lib/mcp";

export async function POST(req: Request, { params }: { params: Promise<{ brand: string }> }) {
  const brand = normalizeSubdomain((await params).brand);
  if (!brand) return new Response(null, { status: 404 });
  return handleMcp(req, brand);
}

export const GET = mcpNotAllowed;
export const DELETE = mcpNotAllowed;
