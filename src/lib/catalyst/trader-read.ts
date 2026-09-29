import type { CatalystEvent, CatalystEventType } from "@/types/catalyst";
import { EVENT_TYPE_LABEL, formatSurprisePct, timeOfDayLabel } from "@/lib/catalyst/parsers";

export interface CatalystTraderLine {
  label: "Catalyst" | "Evidence" | "Timing";
  text: string;
}

type CatalystReadInput = Pick<
  CatalystEvent,
  | "title"
  | "description"
  | "event_type"
  | "source_name"
  | "verification_state"
  | "published_at"
  | "event_date"
  | "event_time"
  | "time_of_day"
  | "facts"
  | "ticker_specific"
>;

function eventLabel(eventType: string): string {
  if (eventType in EVENT_TYPE_LABEL) return EVENT_TYPE_LABEL[eventType as CatalystEventType];
  return eventType;
}

/**
 * Trader hierarchy from stored catalyst fields only.
 * Omits market reaction, risk, scanner events, and any score — those are not on the event.
 */
export function buildCatalystTraderRead(event: CatalystReadInput): CatalystTraderLine[] {
  const lines: CatalystTraderLine[] = [];
  const title = event.title?.trim();
  lines.push({
    label: "Catalyst",
    text: title || eventLabel(event.event_type),
  });

  const evidence: string[] = [];
  if (event.source_name?.trim()) evidence.push(event.source_name.trim());
  if (event.verification_state === "provider_reported") evidence.push("Provider reported");
  if (event.ticker_specific === true) evidence.push("Ticker-specific");
  if (event.ticker_specific === false) evidence.push("Not marked ticker-specific");
  const surprise = formatSurprisePct(event.facts?.surprise_percent);
  if (surprise) evidence.push(`Surprise ${surprise}`);
  const description = event.description?.trim();
  if (description) {
    evidence.push(description.length > 160 ? `${description.slice(0, 157).trim()}...` : description);
  }
  if (evidence.length > 0) lines.push({ label: "Evidence", text: evidence.join(" · ") });

  const timing: string[] = [];
  if (event.event_date) timing.push(event.event_date);
  const tod = timeOfDayLabel(event.time_of_day);
  if (tod) timing.push(tod);
  if (event.event_time) timing.push(event.event_time);
  if (event.published_at) timing.push(`Published ${event.published_at}`);
  if (timing.length > 0) lines.push({ label: "Timing", text: timing.join(" · ") });

  return lines;
}
