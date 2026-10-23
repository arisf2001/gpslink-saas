import { handleMcp, mcpNotAllowed } from "@/lib/mcp";

export async function POST(req: Request) {
  return handleMcp(req, null);
}

export const GET = mcpNotAllowed;
export const DELETE = mcpNotAllowed;
