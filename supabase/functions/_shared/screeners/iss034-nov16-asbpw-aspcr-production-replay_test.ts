/**
 * ISS-034 — Nov 16 5:05 PM ET production unresolved symbols (owner-identified).
 * ASBPW / ASPCR: positive day.o, prevDay.c=0, historical coverage blocks no-prior struct.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateGappersEvidence,
  isStructurallyNoPriorSession,
  type HistoricalCoverageEvidence,
} from "./evaluation-evidence.ts";
import {
  classifyGappersGapInput,
  replayGappersGapInputAccounting,
} from "./gappers-gap-input-accounting.ts";
import type { PolygonTicker } from "./selection.ts";

const RTH_NOW = Date.parse("2026-11-16T22:05:00.000Z");

const ZERO_PREV = { o: 0, h: 0, l: 0, c: 0, v: 0 };

function asbpwLike(): PolygonTicker {
  return {
    ticker: "ASBPW",
    updated: RTH_NOW * 1_000_000,
    day: { o: 0.0121, c: 0.011, h: 0.013, l: 0.01, v: 850_000 },
    prevDay: { ...ZERO_PREV },
    min: { v: 1000, av: 850_000, t: RTH_NOW },
  };
}

function aspcrLike(): PolygonTicker {
  return {
    ticker: "ASPCR",
    updated: RTH_NOW * 1_000_000,
    day: { o: 0.0551, c: 0.054, h: 0.056, l: 0.05, v: 620_000 },
    prevDay: { ...ZERO_PREV },
    min: { v: 800, av: 620_000, t: RTH_NOW },
  };
}

const nov16Coverage: HistoricalCoverageEvidence = {
  baselineSymbols: new Set(["ASBPW"]),
  policyExclusions: {
    available: true,
    min_sessions: 120,
    excluded_count: 1,
    symbols: new Set(["ASPCR"]),
  },
};

const replayBase = {
  extendedSession: false,
  observationSessionFields: false,
  nowMs: RTH_NOW,
};

Deno.test("Nov16 prod: ASBPW is missing_prior_close (not missing open)", () => {
  const t = asbpwLike();
  const cls = classifyGappersGapInput(
    t,
    { extendedSession: false, nowMs: RTH_NOW },
    {
      ...replayBase,
      isStructurallyNoPriorSession: (tick) =>
        isStructurallyNoPriorSession(tick, nov16Coverage, false, RTH_NOW),
    },
  );
  assertEquals(cls.bucket, "unresolved");
  assertEquals(cls.rejectReason, "missing_prior_close");
  assertEquals(cls.rejectDetail?.has_positive_day_o, true);
  assertEquals(cls.rejectDetail?.has_positive_prevDay_c, false);
});

Deno.test("Nov16 prod: ASPCR is missing_prior_close with policy exclusion", () => {
  const t = aspcrLike();
  const cls = classifyGappersGapInput(
    t,
    { extendedSession: false, nowMs: RTH_NOW },
    {
      ...replayBase,
      isStructurallyNoPriorSession: (tick) =>
        isStructurallyNoPriorSession(tick, nov16Coverage, false, RTH_NOW),
    },
  );
  assertEquals(cls.bucket, "unresolved");
  assertEquals(cls.rejectReason, "missing_prior_close");
  assertEquals(cls.symbol, "ASPCR");
});

Deno.test("Nov16 prod: twin unresolved reconcile stored accum 1302/1298/1/1/2", () => {
  const fillers: PolygonTicker[] = [];
  for (let i = 0; i < 1298; i++) {
    fillers.push({
      ticker: `ZCALC${i}`,
      day: { o: 10, c: 10.1, v: 50_000 },
      prevDay: { c: 10, v: 1 },
    });
  }
  const noPrior: PolygonTicker = {
    ticker: "STRUCTNOPR",
    day: { o: 8, c: 8.1, h: 8.2, l: 7.9, v: 400_000 },
    prevDay: { ...ZERO_PREV },
  };
  const split: PolygonTicker = {
    ticker: "SPLIT1",
    day: { o: 50, c: 1.01, v: 300_000 },
    prevDay: { c: 48, v: 1 },
  };
  const universe = [
    ...fillers,
    noPrior,
    split,
    asbpwLike(),
    aspcrLike(),
  ];
  const ev = evaluateGappersEvidence(
    universe,
    [],
    nov16Coverage,
    false,
    RTH_NOW,
  );
  assertEquals(ev.volume_positive_count, 1302);
  assertEquals(ev.gap_calculable_count, 1298);
  assertEquals(ev.no_prior_session_count, 1);
  assertEquals(ev.split_scale_suppressed_count, 1);
  assertEquals(ev.unresolved_gap_input_count, 2);
  assertEquals(ev.unresolved_gap_symbols?.sort(), ["ASBPW", "ASPCR"]);
  const detail = replayGappersGapInputAccounting([asbpwLike(), aspcrLike()], {
    ...replayBase,
    isStructurallyNoPriorSession: (t) =>
      isStructurallyNoPriorSession(t, nov16Coverage, false, RTH_NOW),
  });
  assertEquals(
    detail.unresolved.every((r) => r.rejectReason === "missing_prior_close"),
    true,
  );
});

/** Stored job counters — full 13,240-symbol byte replay requires Lovable export. */
Deno.test("Nov16 prod: replay disclaimer — subset reproduces owner accum identity only", () => {
  const stored = {
    volume_positive_count: 1302,
    gap_calculable_count: 1298,
    no_prior_session_count: 1,
    split_scale_suppressed_count: 1,
    unresolved_gap_input_count: 2,
  };
  const replayed = replayGappersGapInputAccounting(
    [asbpwLike(), aspcrLike()],
    {
      ...replayBase,
      isStructurallyNoPriorSession: (t) =>
        isStructurallyNoPriorSession(t, nov16Coverage, false, RTH_NOW),
    },
  );
  assertEquals(replayed.volume_positive_count, 2);
  assertEquals(stored.unresolved_gap_input_count, replayed.unresolved_gap_input_count);
});