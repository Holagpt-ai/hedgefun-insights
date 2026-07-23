import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyCursor, deriveUniqueTickers } from "./batch.ts";

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
