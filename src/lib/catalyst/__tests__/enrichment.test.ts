import { describe, expect, it } from "vitest";
import type { CatalystEvent } from "@/types/catalyst";
import {
  batchHitRowLimit,
  catalystSymbolHref,
  chunkSymbols,
  classifyEnrichmentEvent,
  ENRICHMENT_BATCH_ROW_LIMIT,
  ENRICHMENT_RECENT_MS,
  ENRICHMENT_SYMBOL_BATCH_SIZE,
  enrichmentFetchWindow,
  eventDateInFetchWindow,
  normalizeEnrichmentSymbols,
  selectEnrichmentEntries,
  symbolsMissingFromPayload,
} from "@/lib/catalyst/enrichment";
import { scheduledMomentMs } from "@/lib/catalyst/parsers";

const NOW = Date.parse("2026-07-30T16:00:00.000Z");

/** Production-shaped XRX earnings row (date-only, older announcement published_at). */
function xrxEarnings(): CatalystEvent {
  return evt({
    id: "xrx-earn-2026-07-30",
    symbol: "XRX",
    event_type: "earnings",
    event_date: "2026-07-30",
    event_time: null,
    title: "Xerox Holdings Corporation Common Stock earnings",
    source_name: "Earnings Calendar",
    source_url: null,
    published_at: "2026-07-01T12:00:00.000Z",
    company_name: "Xerox Holdings Corporation Common Stock",
  });
}

function evt(overrides: Partial<CatalystEvent> & Pick<CatalystEvent, "id" | "symbol">): CatalystEvent {
  return {
    dedupe_key: overrides.dedupe_key ?? `dk:${overrides.id}`,
    company_name: overrides.company_name ?? null,
    event_type: overrides.event_type ?? "company_news",
    verification_state: "provider_reported",
    event_date: overrides.event_date ?? "2026-07-30",
    event_time: overrides.event_time ?? null,
    time_of_day: overrides.time_of_day ?? null,
    title: overrides.title ?? `${overrides.symbol} headline`,
    description: overrides.description ?? null,
    source_name: overrides.source_name ?? "Provider",
    source_url: overrides.source_url ?? "https://example.com/a",
    provider: overrides.provider ?? "test",
    related_symbols: overrides.related_symbols ?? [],
    facts: overrides.facts ?? {},
    published_at: overrides.published_at ?? null,
    ...overrides,
  };
}

describe("normalizeEnrichmentSymbols", () => {
  it("uppercases, trims, de-dupes, and sorts", () => {
    expect(normalizeEnrichmentSymbols([" msft ", "aapl", "AAPL", "BRK.B"])).toEqual([
      "AAPL",
      "BRK.B",
      "MSFT",
    ]);
  });

  it("drops invalid tickers rather than inventing mappings", () => {
    expect(normalizeEnrichmentSymbols(["", "1234", "<script>", "ok"])).toEqual(["OK"]);
  });
});

describe("chunkSymbols / truncation helpers", () => {
  it("batches multiple requested symbols without dropping any", () => {
    const syms = Array.from({ length: 60 }, (_, i) => `T${String(i).padStart(2, "0")}`);
    const chunks = chunkSymbols(syms, 25);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(ENRICHMENT_SYMBOL_BATCH_SIZE);
    expect(chunks.flat().sort()).toEqual(normalizeEnrichmentSymbols(syms));
  });

  it("detects a full batch row budget so callers can re-query missing symbols", () => {
    expect(batchHitRowLimit(ENRICHMENT_BATCH_ROW_LIMIT)).toBe(true);
    expect(batchHitRowLimit(ENRICHMENT_BATCH_ROW_LIMIT - 1)).toBe(false);
    expect(
      symbolsMissingFromPayload(
        ["AAA", "BBB", "CCC"],
        [{ symbol: "aaa" }, { symbol: "CCC" }],
      ),
    ).toEqual(["BBB"]);
  });
});

describe("classifyEnrichmentEvent", () => {
  it("treats scheduled future earnings as upcoming even with older published_at", () => {
    const classified = classifyEnrichmentEvent(
      {
        event_date: "2026-08-05",
        event_time: null,
        published_at: "2026-07-01T12:00:00.000Z",
      },
      NOW,
    );
    expect(classified?.kind).toBe("upcoming");
  });

  it("classifies recent published news inside the 72h window", () => {
    const classified = classifyEnrichmentEvent(
      {
        event_date: "2026-07-29",
        published_at: "2026-07-29T18:00:00.000Z",
      },
      NOW,
    );
    expect(classified?.kind).toBe("recent");
  });

  it("rejects events outside the freshness windows", () => {
    expect(
      classifyEnrichmentEvent(
        {
          event_date: "2026-06-01",
          published_at: "2026-06-01T12:00:00.000Z",
        },
        NOW,
      ),
    ).toBeNull();
  });
});

describe("selectEnrichmentEntries", () => {
  it("normalizes map keys and ignores non-requested symbols", () => {
    const map = selectEnrichmentEntries(
      [
        evt({
          id: "1",
          symbol: "aapl",
          published_at: "2026-07-30T12:00:00.000Z",
          title: "Apple news",
        }),
        evt({
          id: "2",
          symbol: "MSFT",
          published_at: "2026-07-30T12:00:00.000Z",
          title: "Microsoft news",
        }),
      ],
      ["AAPL"],
      NOW,
    );
    expect([...map.keys()]).toEqual(["AAPL"]);
    expect(map.get("AAPL")?.event.title).toBe("Apple news");
  });

  it("prefers nearest upcoming over any recent headline", () => {
    const map = selectEnrichmentEntries(
      [
        evt({
          id: "news",
          symbol: "XYZ",
          event_type: "company_news",
          event_date: "2026-07-30",
          published_at: "2026-07-30T15:00:00.000Z",
          title: "Fresh news",
        }),
        evt({
          id: "earn-far",
          symbol: "XYZ",
          event_type: "earnings",
          event_date: "2026-08-20",
          published_at: "2026-07-01T00:00:00.000Z",
          title: "Far earnings",
        }),
        evt({
          id: "earn-near",
          symbol: "XYZ",
          event_type: "earnings",
          event_date: "2026-08-02",
          published_at: "2026-07-01T00:00:00.000Z",
          title: "Near earnings",
        }),
      ],
      ["XYZ"],
      NOW,
    );
    expect(map.get("XYZ")?.kind).toBe("upcoming");
    expect(map.get("XYZ")?.event.title).toBe("Near earnings");
  });

  it("keeps the newest recent event and never lets an older recent replace it", () => {
    const map = selectEnrichmentEntries(
      [
        evt({
          id: "old",
          symbol: "ABC",
          event_date: "2026-07-28",
          published_at: "2026-07-28T12:00:00.000Z",
          title: "Older",
        }),
        evt({
          id: "new",
          symbol: "ABC",
          event_date: "2026-07-30",
          published_at: "2026-07-30T12:00:00.000Z",
          title: "Newer",
        }),
        evt({
          id: "mid",
          symbol: "ABC",
          event_date: "2026-07-29",
          published_at: "2026-07-29T12:00:00.000Z",
          title: "Middle",
        }),
      ],
      ["ABC"],
      NOW,
    );
    expect(map.get("ABC")?.event.title).toBe("Newer");
    expect(map.get("ABC")?.kind).toBe("recent");
  });

  it("returns an empty map entry absence for symbols with no matching event", () => {
    const map = selectEnrichmentEntries(
      [
        evt({
          id: "1",
          symbol: "AAA",
          published_at: "2026-07-30T12:00:00.000Z",
        }),
      ],
      ["AAA", "BBB"],
      NOW,
    );
    expect(map.has("AAA")).toBe(true);
    expect(map.has("BBB")).toBe(false);
    expect(map.size).toBe(1);
  });

  it("preserves provider headline, source, url, and timestamp on the winner", () => {
    const winner = evt({
      id: "w",
      symbol: "DEF",
      title: "Provider headline",
      source_name: "Wire",
      source_url: "https://example.com/story",
      published_at: "2026-07-30T10:00:00.000Z",
    });
    const map = selectEnrichmentEntries([winner], ["DEF"], NOW);
    const e = map.get("DEF")!.event;
    expect(e.title).toBe("Provider headline");
    expect(e.source_name).toBe("Wire");
    expect(e.source_url).toBe("https://example.com/story");
    expect(e.published_at).toBe("2026-07-30T10:00:00.000Z");
  });
});

describe("catalystSymbolHref", () => {
  it("hands off a normalized ?symbol= query", () => {
    expect(catalystSymbolHref(" aapl ")).toBe("/dashboard/catalyst?symbol=AAPL");
    expect(catalystSymbolHref("BRK.B")).toBe("/dashboard/catalyst?symbol=BRK.B");
    expect(catalystSymbolHref("<bad>")).toBeNull();
  });
});

describe("loading versus verified-empty contract", () => {
  it("verified-empty is represented by a completed empty map, not a missing key while pending", () => {
    const completedEmpty = selectEnrichmentEntries([], ["ZZZ"], NOW);
    expect(completedEmpty.size).toBe(0);
    expect(completedEmpty.get("ZZZ")).toBeUndefined();
    // Callers must gate on pending/fetching before reading this absence as
    // "no catalyst". The selection layer only models completed results.
  });
});

describe("XRX date-boundary: retain recent scheduled earnings", () => {
  const xrx = xrxEarnings();
  const scheduled = scheduledMomentMs(xrx)!;
  const beforeUtcMidnight = Date.parse("2026-07-30T23:59:59.000Z");
  const afterUtcMidnight = Date.parse("2026-07-31T00:00:01.000Z");

  it("qualifies immediately before UTC midnight on the event date", () => {
    expect(eventDateInFetchWindow(xrx.event_date, beforeUtcMidnight)).toBe(true);
    const classified = classifyEnrichmentEvent(xrx, beforeUtcMidnight);
    expect(classified).not.toBeNull();
    // After ET midnight the scheduled moment is past → recent; before that, upcoming.
    expect(["upcoming", "recent"]).toContain(classified!.kind);
    const map = selectEnrichmentEntries([xrx], ["XRX"], beforeUtcMidnight);
    expect(map.get("XRX")?.event.title).toBe(
      "Xerox Holdings Corporation Common Stock earnings",
    );
    expect(map.get("XRX")?.event.source_name).toBe("Earnings Calendar");
  });

  it("remains eligible immediately after UTC rolls to the next calendar day", () => {
    // Prior bug: upcomingFrom became 2026-07-31 and dropped event_date 2026-07-30,
    // while old published_at also failed the recent published_at filter.
    const window = enrichmentFetchWindow(afterUtcMidnight);
    expect(window.eventDateFrom <= "2026-07-30").toBe(true);
    expect(eventDateInFetchWindow("2026-07-30", afterUtcMidnight)).toBe(true);
    expect(classifyEnrichmentEvent(xrx, afterUtcMidnight)?.kind).toBe("recent");
    expect(selectEnrichmentEntries([xrx], ["XRX"], afterUtcMidnight).has("XRX")).toBe(
      true,
    );
  });

  it("remains eligible throughout the approved 72h recent window", () => {
    const nearExpiry = scheduled + ENRICHMENT_RECENT_MS - 1;
    expect(classifyEnrichmentEvent(xrx, nearExpiry)?.kind).toBe("recent");
    expect(selectEnrichmentEntries([xrx], ["XRX"], nearExpiry).has("XRX")).toBe(true);
  });

  it("expires after the approved recent window", () => {
    const expired = scheduled + ENRICHMENT_RECENT_MS + 1;
    expect(classifyEnrichmentEvent(xrx, expired)).toBeNull();
    expect(selectEnrichmentEntries([xrx], ["XRX"], expired).has("XRX")).toBe(false);
  });

  it("does not let an older published_at eliminate a valid scheduled event", () => {
    expect(xrx.published_at).toBe("2026-07-01T12:00:00.000Z");
    expect(classifyEnrichmentEvent(xrx, afterUtcMidnight)).not.toBeNull();
  });

  it("NUWE/BHC-style symbols with no rows remain verified-empty", () => {
    const map = selectEnrichmentEntries([xrx], ["NUWE", "BHC", "XRX"], afterUtcMidnight);
    expect(map.has("XRX")).toBe(true);
    expect(map.has("NUWE")).toBe(false);
    expect(map.has("BHC")).toBe(false);
  });

  it("USEA-style multiple scheduled events still select the nearest upcoming", () => {
    const useaNear = evt({
      id: "usea-near",
      symbol: "USEA",
      event_type: "earnings",
      event_date: "2026-08-02",
      published_at: "2026-07-01T00:00:00.000Z",
      title: "USEA near earnings",
      source_name: "Earnings Calendar",
    });
    const useaFar = evt({
      id: "usea-far",
      symbol: "USEA",
      event_type: "earnings",
      event_date: "2026-08-20",
      published_at: "2026-07-01T00:00:00.000Z",
      title: "USEA far earnings",
      source_name: "Earnings Calendar",
    });
    const map = selectEnrichmentEntries(
      [useaFar, useaNear],
      ["USEA"],
      afterUtcMidnight,
    );
    expect(map.get("USEA")?.kind).toBe("upcoming");
    expect(map.get("USEA")?.event.title).toBe("USEA near earnings");
  });
});
