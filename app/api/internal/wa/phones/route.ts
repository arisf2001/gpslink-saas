import { checkInternalKey, profilePhones } from "@/lib/wa";

// The worker asks WhatsApp for these numbers' LIDs, so senders hidden behind a LID are still recognised.
export async function GET(req: Request) {
  if (!checkInternalKey(req.headers.get("x-wa-key"))) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json({ phones: await profilePhones() });
}
