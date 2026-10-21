import { describe, expect, it } from "vitest";
import type { CatalystEvent } from "@/types/catalyst";
import {
  buildCatalystEvidenceGraph,
  CATALYST_REACTION_NON_CAUSATION,
} from "@/lib/catalyst/catalyst-evidence-graph";

describe("catalyst evidence graph", () => {
  it("builds company → event → source edges deterministically", () => {
    const event: CatalystEvent = {
      id: "evt-1",
      dedupe_key: "k",
      symbol: "AAA",
      company_name: "Alpha",
      event_type: "product_contract",
      verification_state: "provider_reported",
      event_date: "2026-09-22",
      event_time: null,
      time_of_day: null,
      title: "Alpha announces deal",
      description: null,
      source_name: "GlobeNewswire",
      source_url: "https://example.com/pr",
      provider: "news",
      related_symbols: [],
      facts: {},
      published_at: "2026-09-22T12:00:00.000Z",
    };
    const graph = buildCatalystEvidenceGraph(event);
    expect(graph.nodes.some((n) => n.kind === "company" && n.symbol === "AAA")).toBe(true);
    expect(graph.nodes.some((n) => n.kind === "event" && n.eventId === "evt-1")).toBe(true);
    expect(graph.nodes.some((n) => n.kind === "source")).toBe(true);
    expect(graph.edges.some((e) => e.kind === "company_event")).toBe(true);
    expect(graph.reactionDisclaimer).toBe(CATALYST_REACTION_NON_CAUSATION);
  });

  it("adds reaction node only when persisted observation evidence exists", () => {
    const withReaction: CatalystEvent = {
      id: "evt-2",
      dedupe_key: "k2",
      symbol: "BBB",
      company_name: "Beta",
      event_type: "sec_filing_news",
      verification_state: "provider_reported",
      event_date: "2026-09-22",
      event_time: null,
      time_of_day: null,
      title: "8-K",
      description: null,
      source_name: "SEC",
      source_url: "https://example.com/sec",
      provider: "sec",
      related_symbols: [],
      facts: {
        reaction_evidence: {
          observation_id: "obs-1",
          window: "m15",
          price_change_pct: 1.2,
        },
      },
      published_at: "2026-09-22T12:00:00.000Z",
    };
    const graph = buildCatalystEvidenceGraph(withReaction);
    expect(graph.nodes.some((n) => n.kind === "reaction")).toBe(true);
    expect(graph.edges.some((e) => e.kind === "event_reaction")).toBe(true);
  });
});
