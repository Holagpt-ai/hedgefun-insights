import { describe, expect, it } from "vitest";
import {
  compareCatalystFeedEvents,
  isHighSignalCatalystEvent,
} from "@/lib/catalyst/catalyst-discovery-priority";
import type { CatalystEvent } from "@/types/catalyst";

const NOW = Date.parse("2026-10-23T18:00:00.000Z");

function event(partial: Partial<CatalystEvent> = {}): CatalystEvent {
  return {
    id: "1",
    symbol: "AAA",
    event_type: "earnings",
    provider: "benzinga",
    title: "Q3 earnings results",
    verification_state: "provider_reported",
    event_date: "2026-10-23",
    published_at: "2026-10-23T16:00:00.000Z",
    ...partial,
  } as CatalystEvent;
}

describe("catalyst discovery priority", () => {
  it("treats earnings as high-signal", () => {
    expect(isHighSignalCatalystEvent(event())).toBe(true);
  });

  it("ranks higher-precedence events first in priority mode", () => {
    const earnings = event({ id: "e", event_type: "earnings", title: "Q3 earnings beat" });
    const press = event({
      id: "p",
      event_type: "company_news",
      title: "Company mentioned in sector roundup",
      published_at: "2026-10-23T17:00:00.000Z",
    });
    const sorted = [press, earnings].sort((a, b) => compareCatalystFeedEvents(a, b, "priority", NOW));
    expect(sorted[0].id).toBe("e");
  });
});
