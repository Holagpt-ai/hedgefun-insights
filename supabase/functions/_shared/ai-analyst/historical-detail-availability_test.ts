import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyLoadedHistoricalMemory } from "./historical-detail-availability.ts";

Deno.test("loaded historical memory is not marked unavailable by a thin handoff", () => {
  const packet = applyLoadedHistoricalMemory(
    {
      unavailable: { historicalDetail: true, catalyst: false },
      HISTORICAL_EVIDENCE: { workflowSummary: { historicalContextAvailable: false } },
    },
    { contextLoaded: true, nextSessionPositiveContinuationRate: 0.62 },
  );
  const unavailable = packet.unavailable as { historicalDetail: boolean };
  assertEquals(unavailable.historicalDetail, false);
  const evidence = packet.HISTORICAL_EVIDENCE as { backendEvidenceRetained?: boolean };
  assertEquals(evidence.backendEvidenceRetained, true);
});

Deno.test("missing historical memory keeps the unavailable flag", () => {
  const packet = applyLoadedHistoricalMemory(
    { unavailable: { historicalDetail: true } },
    { contextLoaded: false },
  );
  const unavailable = packet.unavailable as { historicalDetail: boolean };
  assertEquals(unavailable.historicalDetail, true);
});
