// Advisory dispatch with a persisted outbox. Default mode is dry-run: nothing leaves the machine
// unless DISPATCH_MODE=live and DISPATCH_WEBHOOK_URL are both set.

import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { Advisory, OutboxEntry } from "./types";
import { buildCap } from "./cap";

const OUTBOX = path.join(process.cwd(), ".data", "outbox.json");

export function dispatchConfig() {
  const webhook = process.env.DISPATCH_WEBHOOK_URL;
  const live = process.env.DISPATCH_MODE === "live" && !!webhook;
  return { live, webhookConfigured: !!webhook, mode: live ? "live" : "dry-run" } as const;
}

export async function readOutbox(): Promise<OutboxEntry[]> {
  try {
    return JSON.parse(await fs.readFile(OUTBOX, "utf8"));
  } catch {
    return [];
  }
}

async function writeOutbox(entries: OutboxEntry[]) {
  await fs.mkdir(path.dirname(OUTBOX), { recursive: true });
  await fs.writeFile(OUTBOX, JSON.stringify(entries.slice(0, 500), null, 2));
}

export async function dispatchAdvisories(advisories: Advisory[], stormName: string, exercise: boolean): Promise<OutboxEntry[]> {
  const cfg = dispatchConfig();
  const results: OutboxEntry[] = [];
  for (const a of advisories) {
    const capXml = buildCap(a, { stormName, exercise });
    const base = {
      id: `ob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      advisoryId: a.id,
      authorityName: a.authorityName,
      alertLevel: a.alertLevel,
      headline: a.headline,
      sentAt: new Date().toISOString(),
      capXml,
      stormName,
    };
    if (!cfg.live) {
      results.push({ ...base, channel: "dry-run", status: "dry-run", detail: "Recorded in outbox only (DISPATCH_MODE is not 'live')." });
      continue;
    }
    try {
      const text = `*${a.alertLevel}* ${a.headline}\n${a.summary}\n\nActions:\n${a.actions
        .slice(0, 6)
        .map((x) => `- [${x.timeframe}] ${x.action}`)
        .join("\n")}\n\nSMS: ${a.smsText}`;
      const res = await fetch(process.env.DISPATCH_WEBHOOK_URL!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, advisory: a, cap: capXml }),
        signal: AbortSignal.timeout(15_000),
      });
      results.push({
        ...base,
        channel: "webhook",
        status: res.ok ? "sent" : "failed",
        detail: res.ok ? `Webhook accepted (${res.status})` : `Webhook responded ${res.status}`,
      });
    } catch (e) {
      results.push({ ...base, channel: "webhook", status: "failed", detail: (e as Error).message });
    }
  }
  const existing = await readOutbox();
  await writeOutbox([...results, ...existing]);
  return results;
}
