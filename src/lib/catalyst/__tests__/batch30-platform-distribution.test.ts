import { describe, expect, it } from "vitest";
import type { CatalystEvent } from "@/types/catalyst";
import { buildSymbolCatalystPlatformMap } from "@/lib/catalyst/build-symbol-catalyst-platform-map";
import { resolveMorningCatalystIntelStatus } from "@/lib/am-inbox/am-inbox-catalyst-intelligence";
import { resolveVolumeLeaderCatalystIntel } from "@/lib/action-center/action-center-catalyst-intelligence";
import {
  pmCatalystAvailabilityForEvent,
  selectPmInboxVerifiedCatalystActivity,
} from "@/lib/inbox/pm-inbox-catalyst-intelligence";
import { selectPmCatalystActivity } from "@/lib/catalyst/pm-catalyst-activity";
import { resolveRadarNewsCellStateWithPlatform } from "@/features/day-trade-radar-v2/radar-catalyst-platform";
import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";

const nowMs = Date.parse("2026-09-12T18:00:00.000Z");

function verifiedEvent(overrides: Partial<CatalystEvent> = {}): CatalystEvent {
  return {
    id: "ev-1",
    dedupe_key: "k1",
    symbol: "AAA",
    company_name: "AAA Inc",
    event_type: "company_news",
    verification_state: "provider_reported",
    event_date: "2026-09-12",
    event_time: null,
    time_of_day: null,
    title: "AAA awarded contract",
    description: null,
    source_name: "PR",
    source_url: "https://example.com/pr",
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

describe("Batch 30 — platform distribution", () => {
  it("maps verified enrichment to platform context per symbol", () => {
    const enrichment = new Map([["AAA", entry(verifiedEvent())]]);
    const map = buildSymbolCatalystPlatformMap({
      symbols: ["AAA", "BBB"],
      enrichment,
      queryError: false,
      nowMs,
    });
    expect(map.get("AAA")?.availability).toBe("verified");
    expect(map.get("AAA")?.graph).not.toBeNull();
    expect(map.get("BBB")?.availability).toBe("none");
  });

  it("marks morning board unavailable on query error", () => {
    expect(
      resolveMorningCatalystIntelStatus({ catalystIntelError: true }),
    ).toBe("unavailable");
  });

  it("only surfaces verified catalyst on volume leaders", () => {
    const enrichment = new Map([["AAA", entry(verifiedEvent())]]);
    const map = buildSymbolCatalystPlatformMap({
      symbols: ["AAA"],
      enrichment,
      nowMs,
    });
    const intel = resolveVolumeLeaderCatalystIntel({ platform: map.get("AAA") });
    expect(intel.availability).toBe("verified");
    expect(intel.title).toMatch(/contract/i);
  });

  it("filters PM inbox activity through verification guards", () => {
    const good = verifiedEvent({
      id: "good",
      dedupe_key: "good-key",
      source_url: "https://example.com/good",
    });
    const unverified = verifiedEvent({
      id: "bad",
      dedupe_key: "bad-key",
      source_url: "https://example.com/bad",
      attribution_class: "unverified",
    });
    expect(pmCatalystAvailabilityForEvent(good, nowMs)).toBe("verified");
    expect(pmCatalystAvailabilityForEvent(unverified, nowMs)).toBe("none");
    expect(selectPmCatalystActivity([good], nowMs, 6).map((row) => row.id)).toEqual(["good"]);
    const selected = selectPmInboxVerifiedCatalystActivity([unverified, good], nowMs, 6);
    expect(selected.map((row) => row.id)).toEqual(["good"]);
  });

  it("radar catalyst cell requires verified platform availability", () => {
    const enrichment = entry(verifiedEvent({ title: "AAA verified headline" }));
    const map = buildSymbolCatalystPlatformMap({
      symbols: ["AAA"],
      enrichment: new Map([["AAA", enrichment]]),
      nowMs,
    });
    const verifiedDisplay = resolveRadarNewsCellStateWithPlatform({
      symbol: "AAA",
      platform: map.get("AAA"),
      newsStatus: "empty",
    });
    expect(verifiedDisplay.level).toBe("catalyst");

    const noneMap = buildSymbolCatalystPlatformMap({
      symbols: ["AAA"],
      enrichment: new Map([
        ["AAA", entry(verifiedEvent({ attribution_class: "unverified" }))],
      ]),
      nowMs,
    });
    const noneDisplay = resolveRadarNewsCellStateWithPlatform({
      symbol: "AAA",
      platform: noneMap.get("AAA"),
      newsStatus: "empty",
    });
    expect(noneDisplay.level).toBe("none");
  });
});
