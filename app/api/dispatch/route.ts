import type { Advisory } from "@/lib/types";
import { dispatchAdvisories, dispatchConfig, readOutbox } from "@/lib/dispatch";

export async function GET() {
  return Response.json({ config: dispatchConfig(), outbox: await readOutbox() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const advisories = (body?.advisories ?? []) as Advisory[];
  if (!advisories.length) return Response.json({ error: "No advisories to dispatch" }, { status: 400 });
  if (advisories.some((a) => a.status !== "approved")) {
    return Response.json({ error: "Only human-approved advisories can be dispatched" }, { status: 400 });
  }
  const entries = await dispatchAdvisories(advisories, String(body.stormName ?? "Cyclone"), body.exercise !== false);
  return Response.json({ config: dispatchConfig(), entries });
}
