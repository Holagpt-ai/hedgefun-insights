import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluatePriceAlert } from "./evaluate.ts";

Deno.test("price alert crossing above", () => {
  const out = evaluatePriceAlert(
    {
      condition: "price_above",
      threshold: 10,
      referencePrice: null,
      lastObservedPrice: 9,
      armed: true,
      status: "active",
      recurrence: "recurring",
      cooldownMinutes: 60,
      lastTriggeredAtMs: null,
    },
    { price: 11, observedAtMs: Date.now(), latency: "live_delayed" },
  );
  assertEquals(out.shouldTrigger, true);
});
