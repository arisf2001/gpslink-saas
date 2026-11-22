import { authServerMetadata } from "@/lib/oauth";

export function GET() {
  return Response.json(authServerMetadata(), { headers: { "Access-Control-Allow-Origin": "*" } });
}
