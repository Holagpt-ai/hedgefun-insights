import { describe, expect, it } from "vitest";
import {
  buildActionFeed,
  buildFocusTasks,
  countDistinctScannerAlertsForFocus,
  summaryCounts,
} from "@/lib/action-center/aggregate";
import {
  dedupeScannerAlertsForActionFeed,
  pickActionFeedBucket,
  resolveScannerAlertFeedTimestamp,
  resolveVolumeLeaderListSnapshotMeta,
  resolveVolumeLeaderRowSnapshot,
  shouldSuppressWatchlistForScannerDuplicate,
} from "@/lib/action-center/feed-evidence";
import { selectActionCenterHandoffRows } from "@/lib/action-center/handoff-context";
import { actionCenterAnalysesQueryKey } from "@/hooks/useActionCenter";
import type { WatchlistAlertRow } from "@/types/action-center";
import type { ScannerIntelligenceAlertRow } from "@/types/scanner-intelligence-alert";

const NOW = Date.parse("2026-03-15T18:00:00Z");
const CANONICAL =
  "scanner_v1:2026-03-15:AAA:RUNNING_UP:2026-03-15T17:30:00.000Z";

function scanner(over: Partial<ScannerIntelligenceAlertRow> = {}): ScannerIntelligenceAlertRow {
  return {
    id: "s1",
    dedupe_key: CANONICAL,
    symbol: "AAA",
    trading_date: "2026-03-15",
    session_kind: "market",
    event_type: "RUNNING_UP",
    event_at: "2026-03-15T17:30:00.000Z",
    severity: "info",
    price: 10,
    move_pct: 5,
    today_volume: 1_000_000,
    prior_volume: 100_000,
    vol_prior: 10,
    rvol_5m: 3,
    volume_velocity: 50_000,
    volume_acceleration_pct: 20,
    distance_from_hod_pct: 1,
    historical_match_count: 4,
    last_significant_episode_date: "2025-08-02",
    last_significant_episode_id: null,
    comparable_episode_count: 4,
    catalyst_type: "corporate_action",
    catalyst_id: "c1",
    headline: "AAA — RUNNING UP",
    summary: "Running Up",
    metadata: {},
    created_at: "2026-03-15T17:31:00.000Z",
    ...over,
  };
}

function watchlist(over: Partial<WatchlistAlertRow> = {}): WatchlistAlertRow {
  return {
    id: "w1",
    ticker: "AAA",
    alert_type: "market_signal",
    reason: "Momentum",
    facts: {},
    event_time: "2026-03-15T17:25:00.000Z",
    session_date: "2026-03-15",
    dedupe_key: "wl-key",
    created_at: "2026-03-15T17:26:00.000Z",
    ...over,
  };
}

describe("Batch 16 — Action Center evidence integrity", () => {
  it("dedupes duplicate scanner DB rows with one canonical event", () => {
    const rows = [scanner({ id: "a" }), scanner({ id: "b" })];
    expect(dedupeScannerAlertsForActionFeed(rows, NOW)).toHaveLength(1);
  });

  it("keeps two genuine same-symbol scanner events at different times", () => {
    const first = scanner({ id: "a" });
    const second = scanner({
      id: "b",
      dedupe_key:
        "scanner_v1:2026-03-15:AAA:RUNNING_UP:2026-03-15T16:00:00.000Z",
      event_at: "2026-03-15T16:00:00.000Z",
    });
    expect(dedupeScannerAlertsForActionFeed([first, second], NOW)).toHaveLength(2);
  });

  it("does not suppress watchlist unusual_volume when scanner exists for same ticker", () => {
    const keys = new Set([CANONICAL]);
    expect(
      shouldSuppressWatchlistForScannerDuplicate(
        watchlist({ alert_type: "unusual_volume" }),
        keys,
      ),
    ).toBe(false);
    expect(
      shouldSuppressWatchlistForScannerDuplicate(
        watchlist({ alert_type: "market_signal", dedupe_key: CANONICAL }),
        keys,
      ),
    ).toBe(true);
  });

  it("uses market observation for Now bucket, not recent DB insert of old event", () => {
    const late = scanner({
      event_at: "2026-03-15T10:00:00.000Z",
      created_at: "2026-03-15T17:55:00.000Z",
    });
    const timing = resolveScannerAlertFeedTimestamp(late, NOW);
    expect(timing?.sortMs).toBe(Date.parse("2026-03-15T10:00:00.000Z"));
    expect(pickActionFeedBucket(timing!.sortMs, NOW, "recent", true)).toBe("today");
    const feed = buildActionFeed({
      alerts: [],
      scannerAlerts: [late],
      dismissedScannerAlertIds: new Set(),
      catalyst: [],
      savedEventIds: new Set(),
      reviewedEventIds: new Set(),
      openTrades: [],
      nowMs: NOW,
    });
    expect(feed[0]?.bucket).toBe("today");
    expect(feed[0]?.timestampLabel).toContain("Observed");
  });

  it("rejects malformed and future scanner timestamps without created_at fallback", () => {
    expect(
      resolveScannerAlertFeedTimestamp(
        { event_at: "not-a-date", created_at: new Date(NOW).toISOString() },
        NOW,
      ),
    ).toBeNull();
    expect(
      resolveScannerAlertFeedTimestamp(
        {
          event_at: new Date(NOW + 2 * 3600_000).toISOString(),
          created_at: new Date(NOW).toISOString(),
        },
        NOW,
      ),
    ).toBeNull();
  });

  it("labels mixed-age volume leader lists explicitly", () => {
    const meta = resolveVolumeLeaderListSnapshotMeta(
      [
        { provider_as_of: "2026-03-14T20:00:00.000Z" },
        { provider_as_of: "2026-03-15T17:55:00.000Z" },
      ],
      NOW,
    );
    expect(meta.mixedAge).toBe(true);
    expect(meta.badgeLabel).toBe("Mixed-age snapshots");
    expect(resolveVolumeLeaderRowSnapshot({ provider_as_of: "2026-03-14T20:00:00.000Z" }, NOW).kind).toBe(
      "prior_session",
    );
  });

  it("dismisses entire canonical scanner group when one DB row id is dismissed", () => {
    const siblingA = scanner({ id: "row-a" });
    const siblingB = scanner({ id: "row-b" });
    const dismissed = new Set(["row-a"]);
    const feed = buildActionFeed({
      alerts: [],
      scannerAlerts: [siblingA, siblingB],
      dismissedScannerAlertIds: dismissed,
      catalyst: [],
      savedEventIds: new Set(),
      reviewedEventIds: new Set(),
      openTrades: [],
      nowMs: NOW,
    });
    expect(feed.filter((i) => i.source === "scanner_intelligence_alert")).toHaveLength(0);
    expect(countDistinctScannerAlertsForFocus([siblingA, siblingB], dismissed, NOW)).toBe(0);
  });

  it("keeps linked Watchlist alert when scanner duplicate is invalid but valid sibling exists", () => {
    const invalid = scanner({
      id: "bad",
      event_at: new Date(NOW + 2 * 3600_000).toISOString(),
    });
    const valid = scanner({
      id: "good",
      event_at: "2026-03-15T17:30:00.000Z",
    });
    const feed = buildActionFeed({
      alerts: [
        watchlist({
          id: "wl",
          alert_type: "market_signal",
          dedupe_key: CANONICAL,
        }),
      ],
      scannerAlerts: [invalid, valid],
      dismissedScannerAlertIds: new Set(),
      catalyst: [],
      savedEventIds: new Set(),
      reviewedEventIds: new Set(),
      openTrades: [],
      nowMs: NOW,
    });
    expect(feed.filter((i) => i.source === "watchlist_alert")).toHaveLength(0);
    expect(feed.filter((i) => i.source === "scanner_intelligence_alert")).toHaveLength(1);
  });

  it("shows Watchlist when only invalid scanner row shares canonical key", () => {
    const invalid = scanner({
      id: "bad",
      event_at: "not-a-date",
      created_at: new Date(NOW).toISOString(),
    });
    const feed = buildActionFeed({
      alerts: [
        watchlist({
          id: "wl",
          alert_type: "market_signal",
          dedupe_key: CANONICAL,
        }),
      ],
      scannerAlerts: [invalid],
      dismissedScannerAlertIds: new Set(),
      catalyst: [],
      savedEventIds: new Set(),
      reviewedEventIds: new Set(),
      openTrades: [],
      nowMs: NOW,
    });
    expect(feed.filter((i) => i.source === "scanner_intelligence_alert")).toHaveLength(0);
    expect(feed.filter((i) => i.source === "watchlist_alert")).toHaveLength(1);
  });

  it("aligns summary watchlist count and focus scanner count with feed predicates", () => {
    const alerts = [
      watchlist({ id: "w1", alert_type: "unusual_volume" }),
      watchlist({
        id: "w2",
        alert_type: "market_signal",
        dedupe_key: CANONICAL,
      }),
    ];
    const scannerRows = [scanner({ id: "a" }), scanner({ id: "b" })];
    const summary = summaryCounts({
      alerts,
      scannerAlerts: scannerRows,
      dismissedScannerAlertIds: new Set(),
      analyses: [],
      catalyst: [],
      openTrades: [],
      nowMs: NOW,
    });
    const feed = buildActionFeed({
      alerts,
      scannerAlerts: scannerRows,
      dismissedScannerAlertIds: new Set(),
      catalyst: [],
      savedEventIds: new Set(),
      reviewedEventIds: new Set(),
      openTrades: [],
      nowMs: NOW,
    });
    expect(summary.watchlistAlerts).toBe(1);
    expect(feed.filter((i) => i.source === "watchlist_alert")).toHaveLength(1);
    const focusCount = countDistinctScannerAlertsForFocus(scannerRows, new Set(), NOW);
    expect(focusCount).toBe(1);
    const tasks = buildFocusTasks({ summary, savedUnreviewedCount: 0, scannerAlertCount: focusCount });
    expect(tasks.find((t) => t.id === "scanner")?.count).toBe(1);
  });

  it("scopes watchlist analyses cache keys by authenticated user", () => {
    expect(actionCenterAnalysesQueryKey("user-a", ["AAA"])).toEqual([
      "ac",
      "analyses",
      "user-a",
      ["AAA"],
    ]);
    expect(actionCenterAnalysesQueryKey("user-b", ["AAA"])).not.toEqual(
      actionCenterAnalysesQueryKey("user-a", ["AAA"]),
    );
  });

  it("preserves source-aware handoff rows from feed and volume leaders", () => {
    const feed = buildActionFeed({
      alerts: [watchlist({ id: "w1", alert_type: "unusual_volume", ticker: "BBB" })],
      scannerAlerts: [],
      dismissedScannerAlertIds: new Set(),
      catalyst: [],
      savedEventIds: new Set(),
      reviewedEventIds: new Set(),
      openTrades: [],
      nowMs: NOW,
    });
    const rows = selectActionCenterHandoffRows({
      symbol: "BBB",
      feed,
      leaders: [{ symbol: "BBB" }],
    });
    expect(rows.some((r) => r.source === "Watchlist alert")).toBe(true);
    expect(rows.some((r) => r.source === "Volume leader")).toBe(true);
  });
});
