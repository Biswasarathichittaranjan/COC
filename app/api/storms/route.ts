import { HISTORICAL_STORMS } from "@/lib/data/storms";
import { listLiveStorms } from "@/lib/integrations/gdacs";

export async function GET() {
  let live: Awaited<ReturnType<typeof listLiveStorms>> = [];
  let liveError: string | null = null;
  try {
    live = await listLiveStorms();
  } catch (e) {
    liveError = (e as Error).message;
  }
  return Response.json({ historical: HISTORICAL_STORMS, live, liveError });
}
