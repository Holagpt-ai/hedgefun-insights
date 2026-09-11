import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { PriorAnalysis } from "./cost-control.ts";
import {
  MATERIAL_CHANGE_THRESHOLDS,
  compareMaterialChange,
  computeValidThrough,
  decideAfterFacts,
  decideBeforeFetch,
  extractPriorFacts,
  isStillValid,
  isUsablePrior,
  parseManualForceRefresh,
  parsePriorAnalysis,
  resolveForceRefresh,
  shouldInsertHistory,
} from "./cost-control.ts";

const NOW = new Date("2026-09-03T15:00:00.000Z");
const VALID = "2026-09-03T15:10:00.000Z";
const EXPIRED = "2026-09-03T14:50:00.000Z";

function usablePrior(over: Partial<PriorAnalysis> = {}): PriorAnalysis {
  return {
    ticker: "AAPL",
    session_date: "2026-09-03",
    session_type: "rth",
    valid_through: VALID,
    direction: "bullish",
    explanation: "Held above VWAP with unusual volume.",
    failure_reason: null,
    change_pct: 1.2,
    volume: 1_000_000,
    rvol_class: "elevated",
    market_signals: [{ signal_id: "sig.trend_up" }],
    recent_events: [{ event_id: "evt.1" }],
    inputs_quality: { earnings_date: "2026-09-04" },
    ...over,
  };
}

function factsFrom(prior: PriorAnalysis) {
  return extractPriorFacts(prior);
}

Deno.test("unexpired usable analysis is still_valid and skips fetch/Claude", () => {
  const prior = usablePrior();
  assert(isUsablePrior(prior));
  assert(isStillValid(prior, NOW, "2026-09-03", "rth"));
  assertEquals(decideBeforeFetch({
    forceRefresh: false, prior, now: NOW, sessionDate: "2026-09-03", sessionType: "rth",
  }), "skipped_still_valid");
});

Deno.test("manual force refresh bypasses still_valid", () => {
  const prior = usablePrior();
  assertEquals(decideBeforeFetch({
    forceRefresh: true, prior, now: NOW, sessionDate: "2026-09-03", sessionType: "rth",
  }), "fetch");
});

Deno.test("data_unavailable prior is not usable and cannot be still_valid", () => {
  const prior = usablePrior({ direction: "data_unavailable", failure_reason: "SNAPSHOT_STALE" });
  assertEquals(isUsablePrior(prior), false);
  assertEquals(isStillValid(prior, NOW, "2026-09-03", "rth"), false);
  assertEquals(decideBeforeFetch({
    forceRefresh: false, prior, now: NOW, sessionDate: "2026-09-03", sessionType: "rth",
  }), "fetch");
});

Deno.test("expired but unchanged facts skip Claude and do not insert history", () => {
  const prior = usablePrior({ valid_through: EXPIRED });
  assertEquals(decideBeforeFetch({
    forceRefresh: false, prior, now: NOW, sessionDate: "2026-09-03", sessionType: "rth",
  }), "fetch");
  const after = decideAfterFacts({
    forceRefresh: false,
    sufficient: true,
    prior,
    currentFacts: factsFrom(prior),
  });
  assertEquals(after, { kind: "skip", decision: "skipped_unchanged" });
  assertEquals(shouldInsertHistory("skipped_unchanged"), false);
});

Deno.test("expired materially changed analysis requires one Claude call", () => {
  const prior = usablePrior({ valid_through: EXPIRED });
  const current = { ...factsFrom(prior), change_pct: prior.change_pct! + 1.5 };
  const after = decideAfterFacts({
    forceRefresh: false,
    sufficient: true,
    prior,
    currentFacts: current,
  });
  assertEquals(after, { kind: "call", decision: "claude_called_expired_changed" });
  assert(shouldInsertHistory("claude_called_expired_changed"));
});

Deno.test("new sufficient ticker requires one Claude call", () => {
  const after = decideAfterFacts({
    forceRefresh: false,
    sufficient: true,
    prior: null,
    currentFacts: factsFrom(usablePrior()),
  });
  assertEquals(after, { kind: "call", decision: "claude_called_new" });
});

Deno.test("insufficient ticker skips Claude", () => {
  const after = decideAfterFacts({
    forceRefresh: false,
    sufficient: false,
    prior: usablePrior({ valid_through: EXPIRED }),
    currentFacts: { ...factsFrom(usablePrior()), sufficient: false },
  });
  assertEquals(after, { kind: "skip", decision: "skipped_insufficient_data" });
});

Deno.test("manual force refresh on sufficient ticker calls Claude once", () => {
  const prior = usablePrior();
  const after = decideAfterFacts({
    forceRefresh: true,
    sufficient: true,
    prior,
    currentFacts: factsFrom(prior),
  });
  assertEquals(after, { kind: "call", decision: "claude_called_manual" });
});

Deno.test("session transition is material even when other facts match", () => {
  const prior = usablePrior({ session_type: "premarket", valid_through: EXPIRED });
  const current = { ...factsFrom(prior), session_type: "rth" as const };
  const cmp = compareMaterialChange(factsFrom(prior), current);
  assert(cmp.changed);
  assert(cmp.reasons.includes("session_type"));
  const after = decideAfterFacts({
    forceRefresh: false,
    sufficient: true,
    prior,
    currentFacts: current,
  });
  assertEquals(after.decision, "claude_called_expired_changed");
});

Deno.test("volume 25% and RVOL class / signal / event / earnings changes are material", () => {
  const prior = factsFrom(usablePrior());
  assertEquals(compareMaterialChange(prior, { ...prior, volume: 1_249_999 }).changed, false);
  assert(compareMaterialChange(prior, { ...prior, volume: 1_250_000 }).changed);
  assert(compareMaterialChange(prior, { ...prior, rvol_class: "unusual" }).reasons.includes("rvol_class"));
  assert(compareMaterialChange(prior, { ...prior, signal_ids: ["sig.trend_up", "sig.vwap"] }).reasons.includes("signal_ids"));
  assert(compareMaterialChange(prior, { ...prior, event_ids: [] }).reasons.includes("event_ids"));
  assert(compareMaterialChange(prior, { ...prior, earnings_date: "2026-09-05" }).reasons.includes("earnings"));
  assert(compareMaterialChange(prior, { ...prior, sufficient: false }).reasons.includes("sufficiency"));
});

Deno.test("timestamps and bar-count are not part of the fingerprint", () => {
  const prior = usablePrior({
    market_signals: [{ signal_id: "sig.trend_up", observed_at: "2026-09-03T10:00:00Z" }],
    inputs_quality: { earnings_date: "2026-09-04", bar_count: 40, analyzed_at: "nope" },
  });
  const current = factsFrom(usablePrior({
    market_signals: [{ signal_id: "sig.trend_up", observed_at: "2026-09-03T14:59:00Z" }],
    inputs_quality: { earnings_date: "2026-09-04", bar_count: 400 },
  }));
  assertEquals(compareMaterialChange(factsFrom(prior), current).changed, false);
});

Deno.test("change_pct threshold is 1.0 percentage point and is tunable via constants", () => {
  assertEquals(MATERIAL_CHANGE_THRESHOLDS.changePctAbs, 1.0);
  assertEquals(MATERIAL_CHANGE_THRESHOLDS.volumeRelative, 0.25);
  const prior = factsFrom(usablePrior({ change_pct: 2.0 }));
  assertEquals(compareMaterialChange(prior, { ...prior, change_pct: 2.99 }).changed, false);
  assert(compareMaterialChange(prior, { ...prior, change_pct: 3.0 }).changed);
});

Deno.test("unchanged skip extends validity and still_valid/in_flight skip history", () => {
  const vt = computeValidThrough(NOW.getTime(), "rth");
  assertEquals(vt, "2026-09-03T15:10:00.000Z");
  assertEquals(shouldInsertHistory("skipped_still_valid"), false);
  assertEquals(shouldInsertHistory("skipped_unchanged"), false);
  assertEquals(shouldInsertHistory("skipped_in_flight"), false);
  assertEquals(shouldInsertHistory("skipped_insufficient_data"), true);
});

Deno.test("force_refresh is honored only in manual mode", () => {
  const body = { ticker: "AAPL", force_refresh: true };
  assertEquals(parseManualForceRefresh(body), true);
  assertEquals(resolveForceRefresh("manual", body), true);
  assertEquals(resolveForceRefresh("trigger", { record: { symbol: "AAPL" }, force_refresh: true }), false);
  assertEquals(resolveForceRefresh("manual", { ticker: "AAPL" }), false);
});

Deno.test("parsePriorAnalysis accepts a V2 row and rejects junk", () => {
  const parsed = parsePriorAnalysis({
    ticker: "msft",
    session_date: "2026-09-03",
    session_type: "rth",
    valid_through: VALID,
    direction: "neutral",
    explanation: "Range-bound.",
    change_pct: 0.2,
    volume: 10,
    rvol_class: "normal",
    market_signals: [],
    recent_events: [],
    inputs_quality: {},
  });
  assert(parsed);
  assertEquals(parsed!.direction, "neutral");
  assertEquals(parsePriorAnalysis({ ticker: "X" }), null);
});
