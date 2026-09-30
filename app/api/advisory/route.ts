import type { Brief } from "@/lib/brief";
import { draftAdvisories } from "@/lib/advisory";

export const maxDuration = 180;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const brief = body?.brief as Brief | undefined;
  if (!brief?.storm || !Array.isArray(brief.districts)) return Response.json({ error: "Missing briefing" }, { status: 400 });
  const snapshot = typeof body.mapSnapshot === "string" && body.mapSnapshot.length < 6_000_000 ? body.mapSnapshot : null;
  return Response.json(await draftAdvisories(brief, snapshot));
}
