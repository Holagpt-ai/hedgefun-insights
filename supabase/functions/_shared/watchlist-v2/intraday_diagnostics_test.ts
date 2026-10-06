import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyEmptyIntradayBars } from "./intraday-diagnostics.ts";

const base = {
  presentation: "live" as const,
  sessionType: "rth" as const,
  etMinutes: 600,
  rawCount: 0,
  keptCount: 0,
  providerOk: true,
  providerDelayed: false,
};

Deno.test("empty bars are classified instead of a generic error", () => {
  assertEquals(classifyEmptyIntradayBars({ ...base, sessionType: "premarket", etMinutes: 250 }), "NO_BARS_YET");
  assertEquals(classifyEmptyIntradayBars({ ...base, etMinutes: 180 }), "SESSION_NOT_STARTED");
  assertEquals(classifyEmptyIntradayBars({ ...base, providerOk: false }), "REQUEST_ERROR");
  assertEquals(classifyEmptyIntradayBars({ ...base, providerDelayed: true }), "PROVIDER_DELAYED");
  assertEquals(classifyEmptyIntradayBars({ ...base, presentation: "last_completed" }), "PROVIDER_EMPTY");
  assertEquals(
    classifyEmptyIntradayBars({ ...base, presentation: "last_completed", keptCount: 12 }),
    "SESSION_CLOSED_USE_PRIOR",
  );
  assertEquals(classifyEmptyIntradayBars({ ...base, keptCount: 12 }), null);
});
