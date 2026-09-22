import { corporateEventToRow } from "@/lib/episode-event-linkage/corporate-event-record";
import type { CorporateEvent } from "@/types/security-intelligence";
import type { HistoricalBridgeClient } from "@/lib/persistence/historical-bridge-client";

export async function applyCorporateEventBatch(
  bridge: HistoricalBridgeClient,
  events: readonly CorporateEvent[],
): Promise<number> {
  if (events.length === 0) return 0;
  const rows = events.map((event) => corporateEventToRow(event));
  const result = await bridge.call("corporate_event_apply_batch", { rows });
  const applied = result.result && typeof result.result === "object"
    ? Number((result.result as Record<string, unknown>).applied ?? events.length)
    : events.length;
  return Number.isFinite(applied) ? applied : events.length;
}

export async function applyEventReactionLinkBatch(
  bridge: HistoricalBridgeClient,
  rows: readonly Record<string, unknown>[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await bridge.call("event_reaction_link_apply_batch", { rows });
  const applied = result.result && typeof result.result === "object"
    ? Number((result.result as Record<string, unknown>).applied ?? rows.length)
    : rows.length;
  return Number.isFinite(applied) ? applied : rows.length;
}
