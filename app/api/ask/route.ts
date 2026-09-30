import type { Brief } from "@/lib/brief";
import { generateText, geminiConfigured } from "@/lib/integrations/gemini";

export const maxDuration = 90;

const SYSTEM = `You answer questions from disaster-management officials about a modelled cyclone scenario.
Ground every statement in the briefing JSON (ensemble probabilities, lead times, exposures, damage pathways, parametric triggers).
If the briefing does not contain the answer, say so and suggest what data would be needed. Keep answers under 180 words, use short bullet points where helpful, and never invent facilities or figures.`;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const brief = body?.brief as Brief | undefined;
  const question = String(body?.question ?? "").slice(0, 1000);
  if (!brief || !question) return Response.json({ error: "brief and question required" }, { status: 400 });
  if (!geminiConfigured()) return Response.json({ error: "GEMINI_API_KEY is not set" }, { status: 503 });
  const { coastLevels: _c, ...compact } = brief;
  void _c;
  try {
    const { text, model } = await generateText({
      system: SYSTEM,
      parts: [{ text: `Briefing JSON:\n${JSON.stringify(compact)}` }, { text: `Question: ${question}` }],
    });
    return Response.json({ answer: text, model });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
