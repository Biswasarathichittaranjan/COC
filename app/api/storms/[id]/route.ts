import { getLiveStorm } from "@/lib/integrations/gdacs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const eventId = Number(id.replace(/^gdacs-/, ""));
  if (!Number.isFinite(eventId)) return Response.json({ error: "Unknown storm id" }, { status: 400 });
  try {
    return Response.json(await getLiveStorm(eventId));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
