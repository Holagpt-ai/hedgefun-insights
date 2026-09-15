import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  baselineRowsMeetMinSessions,
  parseValidatedBaselineExclusions,
} from "./baseline-exclusion-publish.ts";

const MIN = 120;
const ROWS = [{ symbol: "AAPL", sessions_observed: 120 }];

Deno.test("baseline rows: sessions_observed equal to min_sessions is accepted", () => {
  assertEquals(baselineRowsMeetMinSessions(ROWS, MIN), true);
});

Deno.test("baseline rows: sessions_observed above min_sessions is accepted", () => {
  assertEquals(
    baselineRowsMeetMinSessions([{ symbol: "AAPL", sessions_observed: 121 }], MIN),
    true,
  );
});

Deno.test("baseline rows: sessions_observed one below min_sessions is rejected", () => {
  assertEquals(
    baselineRowsMeetMinSessions([{ symbol: "AAPL", sessions_observed: 119 }], MIN),
    false,
  );
});

Deno.test("baseline rows: missing sessions_observed is rejected", () => {
  assertEquals(baselineRowsMeetMinSessions([{ symbol: "AAPL" }], MIN), false);
});

Deno.test("baseline rows: non-integer sessions_observed is rejected", () => {
  assertEquals(
    baselineRowsMeetMinSessions([{ symbol: "AAPL", sessions_observed: 120.5 }], MIN),
    false,
  );
});

Deno.test("exclusions: empty list is valid complete evidence", () => {
  assertEquals(parseValidatedBaselineExclusions([], MIN, ROWS), []);
});

Deno.test("exclusions: valid insufficient_sessions row is accepted", () => {
  const parsed = parseValidatedBaselineExclusions(
    [{
      symbol: "IPO",
      reason: "insufficient_sessions",
      sessions_observed: 40,
      min_sessions: MIN,
    }],
    MIN,
    ROWS,
  );
  assertEquals(parsed, [{
    symbol: "IPO",
    reason: "insufficient_sessions",
    sessions_observed: 40,
    min_sessions: MIN,
  }]);
});

Deno.test("exclusions: overlap with baseline rows is rejected", () => {
  assertEquals(
    parseValidatedBaselineExclusions(
      [{
        symbol: "AAPL",
        reason: "insufficient_sessions",
        sessions_observed: 40,
        min_sessions: MIN,
      }],
      MIN,
      ROWS,
    ),
    null,
  );
});

Deno.test("exclusions: duplicate symbols are rejected", () => {
  const row = {
    symbol: "IPO",
    reason: "insufficient_sessions",
    sessions_observed: 40,
    min_sessions: MIN,
  };
  assertEquals(parseValidatedBaselineExclusions([row, row], MIN, ROWS), null);
});

Deno.test("exclusions: unrecognized reason is rejected", () => {
  assertEquals(
    parseValidatedBaselineExclusions(
      [{
        symbol: "IPO",
        reason: "other",
        sessions_observed: 40,
        min_sessions: MIN,
      }],
      MIN,
      ROWS,
    ),
    null,
  );
});

Deno.test("exclusions: sessions_observed >= min_sessions is rejected", () => {
  assertEquals(
    parseValidatedBaselineExclusions(
      [{
        symbol: "IPO",
        reason: "insufficient_sessions",
        sessions_observed: 120,
        min_sessions: MIN,
      }],
      MIN,
      ROWS,
    ),
    null,
  );
});

Deno.test("exclusions: min_sessions mismatch is rejected", () => {
  assertEquals(
    parseValidatedBaselineExclusions(
      [{
        symbol: "IPO",
        reason: "insufficient_sessions",
        sessions_observed: 40,
        min_sessions: 60,
      }],
      MIN,
      ROWS,
    ),
    null,
  );
});

Deno.test("exclusions: malformed payload is rejected", () => {
  assertEquals(parseValidatedBaselineExclusions(null, MIN, ROWS), null);
  assertEquals(parseValidatedBaselineExclusions([], 0, ROWS), null);
  assertEquals(parseValidatedBaselineExclusions([], MIN, null), null);
});

Deno.test("exclusions: under-min baseline rows reject the whole publication", () => {
  assertEquals(
    parseValidatedBaselineExclusions([], MIN, [{
      symbol: "AAPL",
      sessions_observed: 40,
    }]),
    null,
  );
});
