/**
 * Sep 16 → Sep 17 premarket regression: extended-session gap open via min.o
 * when day.o is absent after trading-date rollover.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateGappersEvidence,
} from "./evaluation-evidence.ts";
import {
  gapPercent,
  type PolygonTicker,
} from "./selection.ts";
import {
  isExtendedSyncSession,
  resolveSyncSessionKind,
} from "./session-sync-context.ts";

const SEP_17_PREMARKET_MS = Date.parse("2026-09-17T08:30:00.000Z"); // 04:30 ET

function ticker(partial: Partial<PolygonTicker>): PolygonTicker {
  return {
    ticker: "SPCX",
    updated: SEP_17_PREMARKET_MS * 1_000_000,
    day: { c: 10.5, v: 97_000 },
    prevDay: { c: 10, v: 500_000 },
    min: { o: 10.2, c: 10.5, v: 12_000 },
    ...partial,
  };
}

Deno.test("rollover: 04:30 ET resolves pre-market extended session", () => {
  const kind = resolveSyncSessionKind(SEP_17_PREMARKET_MS);
  assertEquals(kind, "pre-market");
  assertEquals(isExtendedSyncSession(kind), true);
});

Deno.test("rollover: min.o supplies gap when day.o missing in premarket", () => {
  const t = ticker({ day: { o: undefined, c: 10.5, v: 97_000 } });
  assertEquals(gapPercent(t, false), null);
  assertEquals(gapPercent(t, true), 2);
});

Deno.test("rollover: gappers evidence evaluated with min.o premarket open", () => {
  const universe = [
    ticker({ day: { o: undefined, c: 10.5, v: 97_000 } }),
  ];
  const evidence = evaluateGappersEvidence(universe, [], undefined, true);
  assertEquals(evidence.status, "evaluated");
  assertEquals(evidence.gap_calculable_count, 1);
});
