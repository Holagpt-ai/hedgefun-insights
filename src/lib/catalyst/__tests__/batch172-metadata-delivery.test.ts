import { describe, expect, it } from "vitest";
import type { CatalystEvent } from "@/types/catalyst";
import { buildCatalystSourceEvidenceSummary } from "@/lib/catalyst/source-evidence-contract";
import {
  mergedIntelPersistMetadata,
  projectIntelCatalystEventFacts,
} from "@/lib/catalyst/intel-catalyst-event-facts-projection";

describe("Batch 172 — metadata delivery to CatalystEvent.facts", () => {
  it("projects IR schedule metadata into client facts and evidence summary", () => {
    const candidate = {
      raw: {
        metadata: { scheduledDate: "2026-11-01" },
      },
      metadata: {
        scheduledDate: "2026-11-01",
        earnings_disposition: "schedule_announced",
        published_at_unavailable: true,
        source_identity: "investor.example.com",
      },
    };
    const persist = mergedIntelPersistMetadata(candidate);
    expect(persist.earnings_disposition).toBe("schedule_announced");
    expect(persist.source_identity).toBe("investor.example.com");

    const facts = projectIntelCatalystEventFacts({
      metadata: persist,
      lifecycle: "scheduled",
      verificationState: "UNVERIFIED",
      materiality: 0.4,
      ingestedAt: "2026-10-25T14:00:00.000Z",
    });
    expect(facts.earnings_disposition).toBe("schedule_announced");
    expect(facts.source_identity).toBe("investor.example.com");
    expect(facts.published_at_unavailable).toBe(true);
    expect(facts.intel_lifecycle).toBe("scheduled");

    const event: CatalystEvent = {
      id: "ev-1",
      dedupe_key: "k1",
      symbol: "AAPL",
      company_name: "Apple Inc.",
      event_type: "earnings",
      verification_state: "provider_reported",
      event_date: "2026-11-01",
      event_time: null,
      time_of_day: null,
      title: "Apple Inc. earnings",
      description: null,
      source_name: "Company IR",
      source_url: "https://investor.example.com/news/1",
      provider: "company_ir",
      related_symbols: [],
      facts,
      published_at: null,
      attribution_class: "direct",
      ticker_specific: true,
    };
    const summary = buildCatalystSourceEvidenceSummary(event);
    expect(summary.earningsDisposition).toBe("schedule_announced");
    expect(summary.sourceIdentity).toBe("investor.example.com");
    expect(summary.publishedState).toBe("unavailable");
    expect(summary.calendarOnly).toBe(false);
  });

  it("projects calendar-only scheduled events with calendar_only flag", () => {
    const facts = projectIntelCatalystEventFacts({
      metadata: {
        calendar_only: true,
        published_at_unavailable: true,
        source_identity: "investor.example.com",
        earnings_disposition: "schedule_announced",
      },
      lifecycle: "scheduled",
      verificationState: "REPORTED",
      materiality: 0.35,
      ingestedAt: "2026-10-25T14:00:00.000Z",
    });
    const event: CatalystEvent = {
      id: "ev-cal",
      dedupe_key: "k-cal",
      symbol: "AAPL",
      company_name: "Apple Inc.",
      event_type: "earnings",
      verification_state: "provider_reported",
      event_date: "2026-11-01",
      event_time: "2026-11-01T21:00:00.000Z",
      time_of_day: "after_close",
      title: "Q4 2026 Earnings Conference Call",
      description: null,
      source_name: "Events Calendar",
      source_url: "https://investor.example.com/events/1",
      provider: "company_events",
      related_symbols: [],
      facts,
      published_at: null,
      attribution_class: "direct",
      ticker_specific: true,
    };
    const summary = buildCatalystSourceEvidenceSummary(event);
    expect(summary.calendarOnly).toBe(true);
    expect(summary.earningsDisposition).toBe("schedule_announced");
  });
});
