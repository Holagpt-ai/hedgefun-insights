import { describe, expect, it } from "vitest";
import { buildCalendarAiAnalystHref, buildCalendarAiHandoffContext } from "@/lib/calendar-v4/ai-handoff";
import type { CalendarV4Event } from "@/lib/calendar-v4/contract";

const base: CalendarV4Event = {
  eventId: "ev-1",
  dedupeKey: null,
  securityId: null,
  symbols: ["NVDA"],
  companyName: null,
  feedType: "catalyst",
  legendCategory: "earnings",
  title: "Q3 earnings",
  description: null,
  eventDate: "2026-11-26",
  eventTime: "16:00:00",
  publishedAt: null,
  status: "scheduled",
  impact: "high",
  hasImpactEvidence: true,
  source: "IR",
  sourceUrl: null,
  retrievedAt: null,
  provider: "test",
  aiSummaryId: null,
};

describe("calendar ai handoff", () => {
  it("builds prompt handoff consumed by AI Analyst", () => {
    const ctx = buildCalendarAiHandoffContext(base, "2026-11-26T20:00:00.000Z")!;
    const href = buildCalendarAiAnalystHref(ctx);
    expect(href).toContain("symbol=NVDA");
    expect(href).toContain("prompt=");
    const prompt = new URL(href, "https://stocksist.com").searchParams.get("prompt") ?? "";
    expect(prompt).toContain("Event ID: ev-1");
  });
});