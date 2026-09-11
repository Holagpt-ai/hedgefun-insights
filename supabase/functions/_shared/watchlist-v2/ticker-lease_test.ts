import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { PriorAnalysis } from "./cost-control.ts";
import {
  MemoryTickerLeaseStore,
  TICKER_LEASE_SECONDS,
  runExclusiveClaudeCall,
} from "./ticker-lease.ts";

const KEY = { ticker: "AAPL", sessionDate: "2026-09-03", sessionType: "rth" as const };
const NOW = new Date("2026-09-03T15:05:00.000Z");

function prior(over: Partial<PriorAnalysis> = {}): PriorAnalysis {
  return {
    ticker: "AAPL",
    session_date: "2026-09-03",
    session_type: "rth",
    valid_through: "2026-09-03T14:50:00.000Z",
    direction: "bullish",
    explanation: "Held above VWAP.",
    failure_reason: null,
    change_pct: 1.2,
    volume: 1_000_000,
    rvol_class: "elevated",
    market_signals: [],
    recent_events: [],
    inputs_quality: {},
    ...over,
  };
}

Deno.test("two concurrent scheduled claims produce at most one Claude call", async () => {
  const store = new MemoryTickerLeaseStore();
  let calls = 0;
  const callClaude = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 20));
    return "ok";
  };
  const shared = {
    store,
    key: KEY,
    forceRefresh: false,
    intendedDecision: "claude_called_expired_changed" as const,
    now: NOW,
    prior: prior(),
    recheckPrior: async () => prior(),
    callClaude,
    waitMs: 5,
    pollMs: 1,
    sleep: async () => {},
  };
  const [a, b] = await Promise.all([
    runExclusiveClaudeCall({ ...shared, requestId: "req-a" }),
    runExclusiveClaudeCall({ ...shared, requestId: "req-b" }),
  ]);
  assertEquals(calls, 1);
  const decisions = [a.decision, b.decision].sort();
  assertEquals(decisions.includes("claude_called_expired_changed"), true);
  assertEquals(decisions.includes("skipped_in_flight"), true);
  assertEquals(a.claudeCalls + b.claudeCalls, 1);
});

Deno.test("manual + scheduled collision produces at most one Claude call", async () => {
  const store = new MemoryTickerLeaseStore();
  let calls = 0;
  const callClaude = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 20));
    return "ok";
  };
  const base = {
    store,
    key: KEY,
    now: NOW,
    prior: prior(),
    recheckPrior: async () => prior(),
    callClaude,
    waitMs: 5,
    pollMs: 1,
    sleep: async () => {},
  };
  const [manual, scheduled] = await Promise.all([
    runExclusiveClaudeCall({
      ...base,
      requestId: "manual-1",
      forceRefresh: true,
      intendedDecision: "claude_called_manual",
    }),
    runExclusiveClaudeCall({
      ...base,
      requestId: "batch-1",
      forceRefresh: false,
      intendedDecision: "claude_called_expired_changed",
    }),
  ]);
  assertEquals(calls, 1);
  assertEquals(manual.claudeCalls + scheduled.claudeCalls, 1);
  assert(
    [manual.decision, scheduled.decision].includes("skipped_in_flight"),
    "loser must skip in-flight",
  );
});

Deno.test("expired lease is reclaimable by a later caller", async () => {
  const store = new MemoryTickerLeaseStore();
  const first = await store.claim(KEY, "crashed", TICKER_LEASE_SECONDS, NOW);
  assertEquals(first.acquired, true);
  store.expire(KEY, NOW);
  const second = await store.claim(
    KEY,
    "recovered",
    TICKER_LEASE_SECONDS,
    new Date(NOW.getTime() + 1),
  );
  assertEquals(second.acquired, true);
  assertEquals(second.holderRequestId, "recovered");
  assertEquals(store.holder(KEY), "recovered");
});

Deno.test("TOCTOU recheck after claim skips Claude when a peer already wrote a valid row", async () => {
  const store = new MemoryTickerLeaseStore();
  let calls = 0;
  const fresh = prior({ valid_through: "2026-09-03T15:20:00.000Z" });
  const result = await runExclusiveClaudeCall({
    store,
    key: KEY,
    requestId: "late",
    forceRefresh: false,
    intendedDecision: "claude_called_expired_changed",
    now: NOW,
    prior: prior(),
    recheckPrior: async () => fresh,
    callClaude: async () => {
      calls += 1;
      return "ok";
    },
  });
  assertEquals(calls, 0);
  assertEquals(result.decision, "skipped_still_valid");
  assertEquals(result.claudeCalls, 0);
});

Deno.test("successful Claude call keeps the lease until persist/release", async () => {
  const store = new MemoryTickerLeaseStore();
  await runExclusiveClaudeCall({
    store,
    key: KEY,
    requestId: "done",
    forceRefresh: false,
    intendedDecision: "claude_called_new",
    now: NOW,
    prior: null,
    recheckPrior: async () => null,
    callClaude: async () => "ok",
  });
  assertEquals(store.holder(KEY), "done");
  await store.release("done");
  const next = await store.claim(KEY, "next", TICKER_LEASE_SECONDS, NOW);
  assertEquals(next.acquired, true);
});
