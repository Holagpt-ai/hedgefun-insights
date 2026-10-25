/**
 * Client-side source evidence contract for IR, press/news, and scheduled events.
 * Reads persisted facts only — no synthetic catalysts.
 */

import type { CatalystEvent } from "@/types/catalyst";
import {
  readIntelFactsFromEvent,
  type IntelVerificationState,
} from "@/lib/catalyst/catalyst-intel-facts";
import { scheduledMomentMs } from "@/lib/catalyst/parsers";

export type EarningsDisposition = "results_reported" | "schedule_announced" | null;

export type PublishedTimestampState = "present" | "unavailable" | "invalid";

export type CatalystSourceEvidenceSummary = {
  symbol: string;
  provider: string;
  sourceName: string;
  sourceUrl: string | null;
  sourceIdentity: string | null;
  publishedAt: string | null;
  publishedState: PublishedTimestampState;
  scheduledMs: number | null;
  earningsDisposition: EarningsDisposition;
  verification: IntelVerificationState | null;
  providerTickerConflict: boolean;
  providerForeignListing: boolean;
  calendarOnly: boolean;
  dedupeKey: string;
  canonicalUrl: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(facts: Record<string, unknown>, key: string): string | null {
  const raw = facts[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function readBool(facts: Record<string, unknown>, key: string): boolean {
  return facts[key] === true;
}

export function readEarningsDisposition(facts: Record<string, unknown>): EarningsDisposition {
  const raw = readString(facts, "earnings_disposition");
  if (raw === "results_reported" || raw === "schedule_announced") return raw;
  return null;
}

export function resolvePublishedTimestampState(event: CatalystEvent): PublishedTimestampState {
  const facts = isRecord(event.facts) ? event.facts : {};
  if (readBool(facts, "published_at_unavailable")) return "unavailable";
  if (event.published_at && Number.isFinite(Date.parse(event.published_at))) return "present";
  return "invalid";
}

/** Upcoming earnings call / calendar slot is not reported earnings. */
export function isScheduleOnlyEarningsEvidence(summary: CatalystSourceEvidenceSummary, nowMs: number): boolean {
  if (summary.earningsDisposition === "results_reported") return false;
  if (summary.earningsDisposition === "schedule_announced") return true;
  if (!summary.calendarOnly && summary.earningsDisposition !== null) return false;
  const scheduled = summary.scheduledMs;
  if (scheduled !== null && scheduled > nowMs) return true;
  return summary.calendarOnly && summary.publishedState !== "present";
}

export function buildCatalystSourceEvidenceSummary(
  event: CatalystEvent,
  nowMs: number = Date.now(),
): CatalystSourceEvidenceSummary {
  const facts = isRecord(event.facts) ? event.facts : {};
  const intel = readIntelFactsFromEvent(event);
  const scheduledMs = scheduledMomentMs(event);
  return {
    symbol: event.symbol.toUpperCase(),
    provider: event.provider,
    sourceName: event.source_name,
    sourceUrl: event.source_url?.trim() ? event.source_url.trim() : null,
    sourceIdentity: readString(facts, "source_identity"),
    publishedAt: event.published_at,
    publishedState: resolvePublishedTimestampState(event),
    scheduledMs,
    earningsDisposition: readEarningsDisposition(facts),
    verification: intel.verification,
    providerTickerConflict: readBool(facts, "provider_ticker_conflict"),
    providerForeignListing: readBool(facts, "provider_foreign_listing"),
    calendarOnly: readBool(facts, "calendar_only"),
    dedupeKey: event.dedupe_key,
    canonicalUrl: readString(facts, "canonical_url") ?? event.source_url,
  };
}

export function providerAttributionBlocked(summary: CatalystSourceEvidenceSummary): boolean {
  return summary.providerTickerConflict;
}
