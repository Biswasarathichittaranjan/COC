import { geeStatus } from "@/lib/integrations/gee";
import { geminiConfigured, geminiModels } from "@/lib/integrations/gemini";
import { openMeteoStatus } from "@/lib/integrations/openmeteo";
import { listLiveStorms } from "@/lib/integrations/gdacs";
import { dispatchConfig } from "@/lib/dispatch";

export async function GET() {
  const [gee, openMeteo, gdacs] = await Promise.all([
    geeStatus(),
    openMeteoStatus(),
    listLiveStorms()
      .then((s) => ({ ok: true, storms: s.length }))
      .catch((e: Error) => ({ ok: false, error: e.message })),
  ]);
  return Response.json({
    gee,
    gemini: { configured: geminiConfigured(), model: geminiModels()[0] },
    openMeteo,
    gdacs,
    dispatch: dispatchConfig(),
  });
}
