import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyCursor, buildAnalysisScope, deriveUniqueTickers } from "./batch.ts";


const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const U3 = "33333333-3333-3333-3333-333333333333";

Deno.test("deriveUniqueTickers dedupes tickers and returns lex-ordered list", () => {
  const rows = [
    { symbol: "aapl", user_id: U2 },
    { symbol: "MSFT", user_id: U1 },
    { symbol: "AAPL", user_id: U3 },
    { symbol: "aapl", user_id: U1 }, // deterministic owner: smallest uuid
  ];
  const r = deriveUniqueTickers(rows);
  assertEquals(r.map((x) => x.ticker), ["AAPL", "MSFT"]);
  const aapl = r.find((x) => x.ticker === "AAPL")!;
  assertEquals(aapl.owner_id, U1);
});

Deno.test("deriveUniqueTickers keeps every watchlist ticker, including names that later go data_unavailable", () => {
  const rows = [
    { symbol: "STALE", user_id: U1 },
    { symbol: "THIN", user_id: U1 },
    { symbol: "AAPL", user_id: U1 },
  ];
  const r = deriveUniqueTickers(rows);
  assertEquals(r.map((x) => x.ticker), ["AAPL", "STALE", "THIN"]);
});

Deno.test("applyCursor does not skip tickers based on analysis outcome", () => {
  const items = [
    { ticker: "ILLQ", owner_id: U1 },
    { ticker: "MSFT", owner_id: U1 },
    { ticker: "NVVE", owner_id: U1 },
  ];
  assertEquals(applyCursor(items, "").map((x) => x.ticker), ["ILLQ", "MSFT", "NVVE"]);
  assertEquals(applyCursor(items, "ILLQ").map((x) => x.ticker), ["MSFT", "NVVE"]);
});

Deno.test("deriveUniqueTickers rejects malformed rows without fabricating owners", () => {
  const rows = [
    { symbol: "", user_id: U1 },
    { symbol: "AAPL", user_id: "not-a-uuid" },
    { symbol: 123 as unknown as string, user_id: U1 },
    { symbol: "BAD_TICKER!", user_id: U1 },
    { symbol: "OK", user_id: U2 },
  ];
  const r = deriveUniqueTickers(rows);
  assertEquals(r.length, 1);
  assertEquals(r[0], { ticker: "OK", owner_id: U2 });
});

Deno.test("applyCursor resumes strictly after prior ticker", () => {
  const items = [
    { ticker: "AAPL", owner_id: U1 },
    { ticker: "MSFT", owner_id: U1 },
    { ticker: "NVDA", owner_id: U1 },
  ];
  assertEquals(applyCursor(items, "").length, 3);
  assertEquals(applyCursor(items, "AAPL").map((x) => x.ticker), ["MSFT", "NVDA"]);
  assertEquals(applyCursor(items, "MSFT").map((x) => x.ticker), ["NVDA"]);
  assertEquals(applyCursor(items, "ZZZZ").length, 0);
});

Deno.test("buildAnalysisScope isolates premarket, RTH and postclose", () => {
  assertEquals(buildAnalysisScope("2026-07-24", "premarket"), "2026-07-24:premarket");
  assertEquals(buildAnalysisScope("2026-07-24", "rth"), "2026-07-24:rth");
  assertEquals(buildAnalysisScope("2026-07-24", "postclose"), "2026-07-24:postclose");
  assert(
    buildAnalysisScope("2026-07-24", "premarket") !== buildAnalysisScope("2026-07-24", "rth"),
  );
  assert(
    buildAnalysisScope("2026-07-24", "rth") !== buildAnalysisScope("2026-07-24", "postclose"),
  );
});

Deno.test("buildAnalysisScope rejects malformed date or session", () => {
  assertThrows(() => buildAnalysisScope("2026/07/24", "rth"), Error, "invalid_session_date");
  assertThrows(() => buildAnalysisScope("bad", "rth"), Error, "invalid_session_date");
  assertThrows(() => buildAnalysisScope("2026-07-24", "afterhours"), Error, "invalid_session_type");
  assertThrows(() => buildAnalysisScope("2026-07-24", ""), Error, "invalid_session_type");
});

Deno.test("batch worker still reanalyzes every unique watchlist ticker including data_unavailable", async () => {
  const worker = await Deno.readTextFile(
    new URL("../../run-watchlist-analysis-v2-batch/index.ts", import.meta.url),
  );
  assert(worker.includes('.from("watchlists")'));
  assert(worker.includes("deriveUniqueTickers"));
  assert(worker.includes('dir === "data_unavailable"'));
  assert(worker.includes('return { status: "unavailable"'));
  assert(!worker.includes("SNAPSHOT_STALE"));
  assert(!worker.includes("INSUFFICIENT_EVIDENCE"));
  assert(!worker.includes("failure_reason"));
});
