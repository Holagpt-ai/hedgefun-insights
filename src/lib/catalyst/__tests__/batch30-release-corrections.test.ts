import { describe, expect, it } from "vitest";
import type { CatalystEvent } from "@/types/catalyst";
import { buildSymbolCatalystPlatformMap } from "@/lib/catalyst/build-symbol-catalyst-platform-map";
import { resolveMorningCatalystIntelStatus } from "@/lib/am-inbox/am-inbox-catalyst-intelligence";
import { resolveVolumeLeaderCatalystIntel } from "@/lib/action-center/action-center-catalyst-intelligence";
import { buildSymbolCatalystPlatformContext } from "@/lib/catalyst/catalyst-platform-context";
import {
  buildMarketEvidenceHandoff,
  verifiedCatalystHandoffFields,
} from "@/lib/daily-intelligence/market-evidence-handoff";
import { resolveRadarNewsCellStateWithPlatform } from "@/features/day-trade-radar-v2/radar-catalyst-platform";
import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";
import { buildMorningOpportunityBoard } from "@/lib/am-inbox/morning-opportunity-board";

const nowMs = Date.parse("2026-09-12T18:00:00.000Z");

function verifiedEvent(overrides: Partial<CatalystEvent> = {}): CatalystEvent {
  return {
    id: "ev-verified",
    dedupe_key: "k-verified",
    symbol: "RUN",
    company_name: "Run Inc",
    event_type: "company_news",
    verification_state: "provider_reported",
    event_date: "2026-09-12",
    event_time: null,
    time_of_day: null,
    title: "RUN verified headline",
    description: null,
    source_name: "PR",
    source_url: "https://example.com/verified",
    provider: "news",
    related_symbols: [],
    facts: { intel_lifecycle: "announced" },
    published_at: "2026-09-12T16:00:00.000Z",
    attribution_class: "direct",
    ticker_specific: true,
    ...overrides,
  };
}

function entry(event: CatalystEvent): CatalystEnrichmentEntry {
  return { event, kind: "recent", sortMs: Date.parse(event.published_at ?? "") };
}

describe("Batch 30 release corrections", () => {
  it("keeps pending until enrichment payload resolves (not premature none)", () => {
    const pendingMap = buildSymbolCatalystPlatformMap({
      symbols: ["AAA"],
      enrichment: undefined,
      queryPending: true,
      nowMs,
    });
    expect(pendingMap.size).toBe(0);
    expect(
      resolveMorningCatalystIntelStatus({
        platform: pendingMap.get("AAA"),
        catalystIntelPending: true,
      }),
    ).toBe("pending");
    expect(resolveVolumeLeaderCatalystIntel({ pending: true }).availability).toBe("pending");
    expect(
      resolveRadarNewsCellStateWithPlatform({
        symbol: "AAA",
        catalystPending: true,
        newsStatus: "empty",
      }).level,
    ).toBe("pending");
  });

  it("does not attach catalyst metadata unless platform context is verified", () => {
    const verifiedPlatform = buildSymbolCatalystPlatformContext({
      symbol: "RUN",
      entry: entry(verifiedEvent()),
      availability: "verified",
      nowMs,
    });
    const unverifiedPlatform = buildSymbolCatalystPlatformContext({
      symbol: "RUN",
      entry: entry(verifiedEvent({ attribution_class: "unverified", id: "ev-bad" })),
      availability: "none",
      nowMs,
    });
    expect(verifiedCatalystHandoffFields(verifiedPlatform)).toEqual({
      catalystAvailability: "verified",
      catalystEventId: "ev-verified",
      catalystHeadline: "RUN verified headline",
    });
    expect(verifiedCatalystHandoffFields(unverifiedPlatform)).toEqual({
      catalystAvailability: null,
      catalystEventId: null,
      catalystHeadline: null,
    });
    expect(verifiedCatalystHandoffFields(null)).toEqual({
      catalystAvailability: null,
      catalystEventId: null,
      catalystHeadline: null,
    });
    const handoff = buildMarketEvidenceHandoff({
      symbol: "RUN",
      contextScope: "current_session",
      sourceSurface: "morning_opportunity",
      ...verifiedCatalystHandoffFields(unverifiedPlatform),
    });
    expect(handoff?.catalystEventId).toBeNull();
    expect(handoff?.catalystHeadline).toBeNull();
  });

  it("preserves volume-first morning board ordering with verified urgency unchanged", () => {
    const enrichment = new Map([["RUN", entry(verifiedEvent())]]);
    const platformBySymbol = buildSymbolCatalystPlatformMap({
      symbols: ["RUN", "LIQ"],
      enrichment,
      nowMs,
    });
    const board = buildMorningOpportunityBoard({
      radarRows: [
        {
          symbol: "LIQ",
          volume: 6_000_000,
          price: 10,
          primary_scanner_event: "RUNNING_UP",
          primary_scanner_event_at: "2026-09-12T14:00:00.000Z",
          scanner_events: [{ type: "RUNNING_UP", active: true }],
          rvol_5m: 2,
        },
        {
          symbol: "RUN",
          volume: 1_200_000,
          price: 8,
          primary_scanner_event: "VOLUME_EXPLOSION",
          primary_scanner_event_at: "2026-09-12T14:00:00.000Z",
          scanner_events: [{ type: "VOLUME_EXPLOSION", active: true }],
          rvol_5m: 4,
        },
      ],
      radarStatus: "available",
      platformBySymbol,
      catalystIntelPending: false,
      nowMs,
    });
    const symbols = board.sections.flatMap((section) => section.cards.map((card) => card.symbol));
    expect(symbols[0]).toBe("LIQ");
    const runCard = board.sections.flatMap((section) => section.cards).find((c) => c.symbol === "RUN");
    expect(runCard?.catalystStatus).toBe("verified");
  });
});
