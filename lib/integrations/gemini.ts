// Gemini client (server-only). Uses the model named in GEMINI_MODEL (default gemini-3.7-flash) and
// falls back to the "latest" Flash alias if the configured model id is unavailable to the key.

import "server-only";
import { GoogleGenAI, type Part } from "@google/genai";

export const DEFAULT_MODEL = "gemini-3.7-flash";

export function geminiConfigured(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

export function geminiModels(): string[] {
  return [...new Set([process.env.GEMINI_MODEL || DEFAULT_MODEL, "gemini-flash-latest"])];
}

let client: GoogleGenAI | null = null;
function ai(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
      httpOptions: { timeout: 120_000 },
    });
  }
  return client;
}

function isModelMissing(e: unknown): boolean {
  const err = e as { status?: number; message?: string };
  return err?.status === 404 || /not found|is not supported|unknown model/i.test(err?.message ?? "");
}

export async function generateJson<T>(opts: {
  system: string;
  parts: Part[];
  schema: Record<string, unknown>;
}): Promise<{ data: T; model: string; latencyMs: number }> {
  let lastErr: unknown = null;
  for (const model of geminiModels()) {
    const t0 = Date.now();
    try {
      const res = await ai().models.generateContent({
        model,
        contents: [{ role: "user", parts: opts.parts }],
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          responseJsonSchema: opts.schema,
        },
      });
      const text = res.text ?? "";
      return { data: JSON.parse(text) as T, model, latencyMs: Date.now() - t0 };
    } catch (e) {
      lastErr = e;
      if (isModelMissing(e)) continue;
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Gemini request failed");
}

export async function generateText(opts: { system: string; parts: Part[] }): Promise<{ text: string; model: string }> {
  let lastErr: unknown = null;
  for (const model of geminiModels()) {
    try {
      const res = await ai().models.generateContent({
        model,
        contents: [{ role: "user", parts: opts.parts }],
        config: { systemInstruction: opts.system },
      });
      return { text: res.text ?? "", model };
    } catch (e) {
      lastErr = e;
      if (isModelMissing(e)) continue;
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Gemini request failed");
}
