import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CatalystEvent } from "@/types/catalyst";
import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";
import { classifyEnrichmentEvent } from "@/lib/catalyst/enrichment";
import {
  attachMarketPulseCatalystContext,
  MARKET_PULSE_CAUSATION_DISCLAIMER,
  resolveVerifiedCatalystForPulse,
} from "@/lib/markets/market-pulse-catalyst";
import { selectMarketPulseItems } from "@/lib/markets/market-pulse-select";
import { moverFromPolygonTicker } from "@/lib/markets/movers-integrity";
import { summarizeMoversListProvenance } from "@/lib/markets/movers-provenance";

const NOW = Date.parse("2026-08-27T16:00:00.000Z");

function evt(overrides: Partial<CatalystEvent> & Pick<CatalystEvent, "id" | "symbol">): CatalystEvent {
  return {
    dedupe_key: overrides.dedupe_key ?? `dk:${overrides.id}`,
    company_name: overrides.company_name ?? `${overrides.symbol} Corp`,
    event_type: overrides.event_type ?? "product_contract",
    verification_state: "provider_reported",
    event_date: overrides.event_date ?? "2026-08-27",
    event_time: overrides.event_time ?? null,
    time_of_day: overrides.time_of_day ?? null,
    title: overrides.title ?? `${overrides.symbol} announces new contract`,
    description: overrides.description ?? null,
    source_name: overrides.source_name ?? "Company press release",
    source_url: overrides.source_url ?? "https://example.com/release",
    provider: overrides.provider ?? "polygon",
    related_symbols: overrides.related_symbols ?? [overrides.symbol],
    facts: overrides.facts ?? {},
    published_at: overrides.published_at ?? "2026-08-27T14:00:00.000Z",
    attribution_class: overrides.attribution_class ?? "direct",
    ticker_specific: overrides.ticker_specific ?? true,
    ...overrides,
  };
}

function recentEntry(event: CatalystEvent): CatalystEnrichmentEntry {
  const classified = classifyEnrichmentEvent(event, NOW);
  if (!classified) throw new Error("fixture not recent");
  return { event, kind: classified.kind, sortMs: classified.sortMs };
}

function basePulseItem(symbol: string) {
  const mover = moverFromPolygonTicker(
    {
      ticker: symbol,
      name: "Example",
      todaysChangePerc: 10,
      day: { c: 22, v: 2_000_000, t: NOW },
      prevDay: { c: 20 },
      lastTrade: { p: 22, t: NOW },
    },
    "regular",
    NOW,
  );
  const prov = summarizeMoversListProvenance([mover], {
    nowMs: NOW,
    universe: "tracked_gainers_losers",
    moverSession: "regular",
  });
  return selectMarketPulseItems({ gainers: [mover], losers: [], provenance: prov, nowMs: NOW })[0]!;
}

describe("Batch 23 — market pulse catalyst integration", () => {
  it("links verified catalyst events with explicit ticker and source evidence", () => {
    const event = evt({
      id: "c1",
      symbol: "XYZ",
      title: "XYZ announces new contract with federal agency",
    });
    const entry = recentEntry(event);
    const resolved = resolveVerifiedCatalystForPulse({
      symbol: "XYZ",
      entry,
      observationMs: NOW,
      sessionEvidence: "current_session",
      nowMs: NOW,
    });
    expect(resolved?.label).toBe("Verified event");
    expect(resolved?.sourceUrl).toBe("https://example.com/release");
    expect(resolved?.causationEstablished).toBe(false);
  });

  it("does not treat upcoming scheduled catalysts as movement context", () => {
    const future = evt({
      id: "up",
      symbol: "ABC",
      event_date: "2026-09-10",
      event_time: "2026-09-10T13:00:00.000Z",
      published_at: "2026-08-01T12:00:00.000Z",
      title: "ABC earnings",
      event_type: "earnings",
    });
    const classified = classifyEnrichmentEvent(future, NOW);
    expect(classified?.kind).toBe("upcoming");
    const entry: CatalystEnrichmentEntry = {
      event: future,
      kind: "upcoming",
      sortMs: classified!.sortMs,
    };
    expect(
      resolveVerifiedCatalystForPulse({
        symbol: "ABC",
        entry,
        observationMs: NOW,
        sessionEvidence: "current_session",
        nowMs: NOW,
      }),
    ).toBeNull();
  });

  it("marks movement unexplained when catalyst evidence is insufficient", () => {
    const item = basePulseItem("NOP");
    const enriched = attachMarketPulseCatalystContext([item], new Map(), NOW);
    expect(enriched[0]?.movementContext).toBe("verified_movement_unexplained");
    expect(enriched[0]?.verifiedCatalyst).toBeNull();
    expect(enriched[0]?.aiExplanationText).toBeNull();
  });

  it("rejects sector-roundup catalyst rows for homepage pulse", () => {
    const sector = evt({
      id: "sec",
      symbol: "QQQ",
      title: "Semiconductor stocks to watch this week",
      attribution_class: "sector_related",
      ticker_specific: false,
      related_symbols: ["NVDA", "AMD", "INTC"],
    });
    const entry = recentEntry(sector);
    expect(
      resolveVerifiedCatalystForPulse({
        symbol: "QQQ",
        entry,
        observationMs: NOW,
        sessionEvidence: "current_session",
        nowMs: NOW,
      }),
    ).toBeNull();
  });

  it("never fabricates AI explanation text when catalyst is attached", () => {
    const event = evt({ id: "ai", symbol: "AI1" });
    const map = new Map<string, CatalystEnrichmentEntry>([["AI1", recentEntry(event)]]);
    const item = basePulseItem("AI1");
    const enriched = attachMarketPulseCatalystContext([item], map, NOW);
    expect(enriched[0]?.movementContext).toBe("verified_movement_with_event");
    expect(enriched[0]?.aiExplanationText).toBeNull();
    expect(enriched[0]?.aiVerificationState).toBe("disabled");
  });

  it("uses neutral causation disclaimer copy in the UI module", () => {
    const pulse = readFileSync(resolve("src/components/home/MarketPulse.tsx"), "utf8");
    expect(pulse).toContain("MARKET_PULSE_CAUSATION_DISCLAIMER");
    expect(MARKET_PULSE_CAUSATION_DISCLAIMER).toMatch(/Causation not established/i);
    expect(pulse).not.toMatch(/Reason for movement/i);
    expect(pulse).not.toMatch(/AI verified/i);
    expect(pulse).not.toContain('from("market_news")');
    expect(pulse).toContain("useCatalystEnrichmentForSymbols");
  });

  it("preserves stock detail and catalyst navigation handoffs", () => {
    const event = evt({ id: "nav", symbol: "NAV" });
    const resolved = resolveVerifiedCatalystForPulse({
      symbol: "NAV",
      entry: recentEntry(event),
      observationMs: NOW,
      sessionEvidence: "delayed_snapshot",
      nowMs: NOW,
    });
    expect(resolved?.catalystPath).toBe("/dashboard/catalyst?symbol=NAV");
  });
});
