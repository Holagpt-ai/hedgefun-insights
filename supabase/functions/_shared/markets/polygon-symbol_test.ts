import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { polygonEquityTicker } from "./polygon-symbol.ts";

Deno.test("polygon equity ticker keeps dotted class shares and maps a single-letter hyphen", () => {
  assertEquals(polygonEquityTicker("AAPL"), "AAPL");
  assertEquals(polygonEquityTicker(" aapl "), "AAPL");
  assertEquals(polygonEquityTicker("brk.b"), "BRK.B");
  assertEquals(polygonEquityTicker("BRK-B"), "BRK.B");
  assertEquals(polygonEquityTicker("BRK.B"), "BRK.B");
  assertEquals(polygonEquityTicker(""), null);
  assertEquals(polygonEquityTicker("   "), null);
  assertEquals(polygonEquityTicker("NOT A TICKER"), null);
  assertEquals(polygonEquityTicker(null), null);
});
