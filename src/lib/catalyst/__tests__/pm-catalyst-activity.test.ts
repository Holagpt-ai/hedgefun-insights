import { describe, expect, it } from "vitest";
import { selectPmCatalystActivity } from "@/lib/catalyst/pm-catalyst-activity";
import type { CatalystEvent, CatalystVerificationState } from "@/types/catalyst";

const TODAY_ET_AFTERNOON = Date.parse("2026-09-12T18:00:00.000Z"); // 2:00 PM EDT
const EDT_BEFORE_MIDNIGHT = Date.parse("2026-09-13T03:59:59.000Z"); // 11:59:59 PM EDT Sep 12
const EDT_AT_MIDNIGHT = Date.parse("2026-09-13T04:00:00.000Z"); // 12:00 AM EDT Sep 13
const EST_BEFORE_MIDNIGHT = Date.parse("2026-01-15T04:59:59.000Z"); // 11:59:59 PM EST Jan 14
const EST_AT_MIDNIGHT = Date.parse("2026-01-15T05:00:00.000Z"); // 12:00 AM EST Jan 15

function event(partial: Partial<CatalystEvent> & Pick<CatalystEvent, "id">): CatalystEvent {
  return {
    dedupe_key: `dedupe_${partial.id}`,
    symbol: "AAPL",
    company_name: "Apple Inc.",
    event_type: "company_news",
    verification_state: "provider_reported",
    event_date: "2026-09-12",
    event_time: null,
    time_of_day: "after_close",
    title: `${partial.id} title`,
    description: null,
    source_name: "Provider",
    source_url: `https://example.com/${partial.id}`,
    provider: "polygon",
    related_symbols: [],
    facts: {},
    published_at: "2026-09-12T16:00:00.000Z",
    ...partial,
  };
}

describe("selectPmCatalystActivity", () => {
  it("retains events on the current ET calendar date", () => {
    const keep = event({ id: "today" });
    const selected = selectPmCatalystActivity([keep], TODAY_ET_AFTERNOON);
    expect(selected).toEqual([keep]);
  });

  it("excludes the previous and next ET calendar dates", () => {
    const selected = selectPmCatalystActivity(
      [
        event({ id: "yesterday", event_date: "2026-09-11" }),
        event({ id: "today", event_date: "2026-09-12" }),
        event({ id: "tomorrow", event_date: "2026-09-13" }),
      ],
      TODAY_ET_AFTERNOON,
    );
    expect(selected.map((row) => row.id)).toEqual(["today"]);
  });

  it("uses the America/New_York date across the UTC/EDT midnight boundary", () => {
    const sep12 = event({ id: "sep-12", event_date: "2026-09-12" });
    const sep13 = event({ id: "sep-13", event_date: "2026-09-13" });

    expect(selectPmCatalystActivity([sep12, sep13], EDT_BEFORE_MIDNIGHT).map((row) => row.id)).toEqual(["sep-12"]);
    expect(selectPmCatalystActivity([sep12, sep13], EDT_AT_MIDNIGHT).map((row) => row.id)).toEqual(["sep-13"]);
  });

  it("uses the America/New_York date across the UTC/EST midnight boundary", () => {
    const jan14 = event({ id: "jan-14", event_date: "2026-01-14" });
    const jan15 = event({ id: "jan-15", event_date: "2026-01-15" });

    expect(selectPmCatalystActivity([jan14, jan15], EST_BEFORE_MIDNIGHT).map((row) => row.id)).toEqual(["jan-14"]);
    expect(selectPmCatalystActivity([jan14, jan15], EST_AT_MIDNIGHT).map((row) => row.id)).toEqual(["jan-15"]);
  });

  it("excludes earnings because they belong to the earnings section", () => {
    const selected = selectPmCatalystActivity(
      [
        event({ id: "earn", event_type: "earnings", title: "AAPL earnings" }),
        event({ id: "news", event_type: "company_news" }),
      ],
      TODAY_ET_AFTERNOON,
    );
    expect(selected.map((row) => row.id)).toEqual(["news"]);
  });

  it("excludes non-provider-reported rows defensively", () => {
    const selected = selectPmCatalystActivity(
      [
        event({
          id: "unverified",
          verification_state: "unverified" as CatalystVerificationState,
        }),
        event({ id: "keep" }),
      ],
      TODAY_ET_AFTERNOON,
    );
    expect(selected.map((row) => row.id)).toEqual(["keep"]);
  });

  it("excludes blank titles and invalid symbols", () => {
    const selected = selectPmCatalystActivity(
      [
        event({ id: "blank", title: "   " }),
        event({ id: "empty", title: "" }),
        event({ id: "bad-symbol", symbol: "1234" }),
        event({ id: "keep", symbol: "MSFT" }),
      ],
      TODAY_ET_AFTERNOON,
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe("keep");
  });

  it("deduplicates by ID", () => {
    const selected = selectPmCatalystActivity(
      [
        event({ id: "same", title: "First copy", published_at: "2026-09-12T15:00:00.000Z" }),
        event({
          id: "same",
          title: "Second copy",
          dedupe_key: "other-key",
          source_url: "https://example.com/other",
          published_at: "2026-09-12T18:00:00.000Z",
        }),
      ],
      TODAY_ET_AFTERNOON,
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].title).toBe("Second copy");
  });

  it("deduplicates by dedupe_key", () => {
    const selected = selectPmCatalystActivity(
      [
        event({
          id: "a",
          dedupe_key: "shared-key",
          published_at: "2026-09-12T14:00:00.000Z",
        }),
        event({
          id: "b",
          dedupe_key: "shared-key",
          source_url: "https://example.com/b",
          published_at: "2026-09-12T18:00:00.000Z",
        }),
      ],
      TODAY_ET_AFTERNOON,
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe("b");
  });

  it("deduplicates by normalized source URL", () => {
    const selected = selectPmCatalystActivity(
      [
        event({
          id: "slash",
          source_url: "https://example.com/story/",
          published_at: "2026-09-12T14:00:00.000Z",
        }),
        event({
          id: "hash",
          dedupe_key: "other-key",
          source_url: "https://example.com/story#section",
          published_at: "2026-09-12T18:00:00.000Z",
        }),
      ],
      TODAY_ET_AFTERNOON,
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe("hash");
  });

  it("keeps the newest event when identities collide", () => {
    const older = event({
      id: "older",
      source_url: "https://example.com/collision",
      event_time: "2026-09-12T15:00:00.000Z",
    });
    const newer = event({
      id: "newer",
      dedupe_key: "different-key",
      source_url: "https://example.com/collision/",
      event_time: "2026-09-12T20:00:00.000Z",
    });
    const selected = selectPmCatalystActivity([older, newer], TODAY_ET_AFTERNOON);
    expect(selected).toEqual([newer]);
  });

  it("applies the display limit after ranking and deduplication", () => {
    const rows = [
      event({ id: "dup-a", source_url: "https://example.com/dup", published_at: "2026-09-12T20:00:00.000Z" }),
      event({
        id: "dup-b",
        dedupe_key: "other",
        source_url: "https://example.com/dup/",
        published_at: "2026-09-12T19:00:00.000Z",
      }),
      event({ id: "third", published_at: "2026-09-12T18:00:00.000Z" }),
      event({ id: "second", published_at: "2026-09-12T19:30:00.000Z" }),
      event({ id: "first", published_at: "2026-09-12T21:00:00.000Z" }),
      event({ id: "earn", event_type: "earnings", published_at: "2026-09-12T22:00:00.000Z" }),
    ];
    const selected = selectPmCatalystActivity(rows, TODAY_ET_AFTERNOON, 2);
    expect(selected.map((row) => row.id)).toEqual(["first", "dup-a"]);
  });

  it("returns the original row object references", () => {
    const original = event({
      id: "rich",
      title: "FDA panel schedules review",
      event_type: "fda_biotech",
    });
    const selected = selectPmCatalystActivity([original], TODAY_ET_AFTERNOON);
    expect(selected).toHaveLength(1);
    expect(selected[0]).toBe(original);
  });

  it("breaks equal timestamps deterministically by original input index", () => {
    const first = event({
      id: "first-in",
      published_at: "2026-09-12T16:00:00.000Z",
      event_time: null,
    });
    const second = event({
      id: "second-in",
      published_at: "2026-09-12T16:00:00.000Z",
      event_time: null,
    });
    const selected = selectPmCatalystActivity([first, second], TODAY_ET_AFTERNOON);
    expect(selected.map((row) => row.id)).toEqual(["first-in", "second-in"]);
  });
});
