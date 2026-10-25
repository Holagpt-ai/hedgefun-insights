import { describe, expect, it } from "vitest";
import type { CatalystEvent } from "@/types/catalyst";
import { hydrateCatalystEventVerification } from "@/lib/catalyst/catalyst-event-verification";
import { buildCatalystEvidenceGraph } from "@/lib/catalyst/catalyst-evidence-graph";
import { passesDirectCatalystVerificationGuard } from "@/lib/catalyst/catalyst-verification-guards";
import { buildSymbolCatalystPlatformMap } from "@/lib/catalyst/build-symbol-catalyst-platform-map";
import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";
import { catalystSourceBadge } from "@/lib/catalyst/presentation";
import {
  buildCatalystSourceEvidenceSummary,
  isScheduleOnlyEarningsEvidence,
  providerAttributionBlocked,
  resolvePublishedTimestampState,
} from "@/lib/catalyst/source-evidence-contract";
function event(overrides: Partial<CatalystEvent> = {}): CatalystEvent {
  return {
    id: "ev-1",
    dedupe_key: "dedupe-1",
    symbol: "AAA",
    company_name: "AAA Inc",
    event_type: "company_news",
    verification_state: "provider_reported",
    event_date: "2026-12-01",
    event_time: "16:00:00",
    time_of_day: null,
    title: "Company news",
    description: null,
    source_name: "IR",
    source_url: "https://investor.example.com/release/1",
    provider: "company_ir",
    related_symbols: [],
    facts: {},
    published_at: "2026-09-12T16:00:00.000Z",
    attribution_class: "direct",
    ticker_specific: true,
    ...overrides,
  };
}

describe("Batch 172 — catalyst source coverage", () => {
  const nowMs = Date.parse("2026-09-12T18:00:00.000Z");

  it("preserves IR source URL and identity on evidence summary", () => {
    const summary = buildCatalystSourceEvidenceSummary(
      event({
        facts: { source_identity: "investor.example.com" },
      }),
      nowMs,
    );
    expect(summary.sourceUrl).toMatch(/investor\.example\.com/);
    expect(summary.sourceIdentity).toBe("investor.example.com");
    expect(catalystSourceBadge("company_ir")).toBe("COMPANY IR");
  });

  it("marks undated IR rows as published unavailable", () => {
    expect(resolvePublishedTimestampState(event({ published_at: null, facts: { published_at_unavailable: true } }))).toBe(
      "unavailable",
    );
  });

  it("blocks provider ticker conflicts from downstream verification", () => {
    const hydrated = hydrateCatalystEventVerification(
      event({
        provider: "news",
        facts: { provider_ticker_conflict: true },
      }),
    );
    expect(hydrated.attribution_class).toBe("unverified");
    expect(passesDirectCatalystVerificationGuard(hydrated, nowMs)).toBe(false);
    expect(providerAttributionBlocked(buildCatalystSourceEvidenceSummary(hydrated, nowMs))).toBe(true);
  });

  it("dedupe keys stay stable for duplicate press releases", () => {
    const a = buildCatalystSourceEvidenceSummary(event({ dedupe_key: "provider:abc" }), nowMs);
    const b = buildCatalystSourceEvidenceSummary(event({ id: "ev-2", dedupe_key: "provider:abc" }), nowMs);
    expect(a.dedupeKey).toBe(b.dedupeKey);
  });

  it("treats future scheduled earnings as schedule-only, not reported results", () => {
    const future = buildCatalystSourceEvidenceSummary(
      event({
        event_date: "2026-12-01",
        published_at: null,
        facts: { earnings_disposition: "schedule_announced", calendar_only: true },
      }),
      nowMs,
    );
    expect(isScheduleOnlyEarningsEvidence(future, nowMs)).toBe(true);
    expect(passesDirectCatalystVerificationGuard(event({ event_date: "2026-12-01", published_at: null }), nowMs)).toBe(
      false,
    );
  });

  it("allows reported earnings disposition with publication timestamp", () => {
    const reported = buildCatalystSourceEvidenceSummary(
      event({
        facts: { earnings_disposition: "results_reported", intel_lifecycle: "announced" },
        published_at: "2026-09-12T16:00:00.000Z",
        event_date: "2026-09-12",
      }),
      nowMs,
    );
    expect(isScheduleOnlyEarningsEvidence(reported, nowMs)).toBe(false);
    expect(
      passesDirectCatalystVerificationGuard(
        event({
          facts: { earnings_disposition: "results_reported", intel_lifecycle: "announced" },
          published_at: "2026-09-12T16:00:00.000Z",
          event_date: "2026-09-12",
        }),
        nowMs,
      ),
    ).toBe(true);
  });

  it("preserves verification state on evidence graph nodes", () => {
    const graph = buildCatalystEvidenceGraph(
      event({
        facts: { intel_verification: "REPORTED", earnings_disposition: "schedule_announced" },
      }),
    );
    const evNode = graph.nodes.find((n) => n.kind === "event");
    expect(evNode && evNode.kind === "event" && evNode.verification).toBe("REPORTED");
    const srcNode = graph.nodes.find((n) => n.kind === "source");
    expect(srcNode && srcNode.kind === "source" && srcNode.publishedState).toBe("present");
  });

  it("keeps platform map verified only when guards pass", () => {
    const good: CatalystEnrichmentEntry = {
      event: event({ facts: { intel_lifecycle: "announced" } }),
      kind: "recent",
      sortMs: nowMs,
    };
    const map = buildSymbolCatalystPlatformMap({ symbols: ["AAA"], enrichment: new Map([["AAA", good]]), nowMs });
    expect(map.get("AAA")?.availability).toBe("verified");
    const bad = event({ facts: { provider_ticker_conflict: true } });
    const mapBad = buildSymbolCatalystPlatformMap({
      symbols: ["AAA"],
      enrichment: new Map([["AAA", { event: bad, kind: "recent", sortMs: nowMs }]]),
      nowMs,
    });
    expect(mapBad.get("AAA")?.availability).toBe("none");
  });

  it("does not treat intel UNVERIFIED rows as direct catalysts (partial failure preservation)", () => {
    expect(
      passesDirectCatalystVerificationGuard(
        event({ facts: { intel_verification: "UNVERIFIED" } }),
        nowMs,
      ),
    ).toBe(false);
  });
});
