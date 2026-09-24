import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchRadarScannerContext } from "./radar-context.ts";
import { buildAiPrompt, buildEvidenceCatalog, buildWatchlistAnthropicBody } from "./ai-read.ts";

Deno.test("radar row with string numerics does not create an invalid Anthropic payload", async () => {
  const ctx = await fetchRadarScannerContext({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({
                    data: {
                      primary_scanner_event: "HOD_BREAK",
                      primary_scanner_event_at: "2026-09-24T14:00:00.000Z",
                      rvol_5m: "2.5",
                      volume_velocity: "1.1",
                      volume_acceleration_pct: null,
                      distance_from_hod_pct: "not-a-number",
                    },
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  }, "AAPL", "2026-09-24");
  assertEquals(ctx?.primary_event, "HOD_BREAK");
  assertEquals(ctx?.rvol_5m, null);
  assertEquals(ctx?.volume_velocity, null);
  assertEquals(ctx?.distance_from_hod_pct, null);

  const catalog = buildEvidenceCatalog({
    market_signals: [], recent_events: [], key_levels: null, metrics: ["scanner_event"],
  });
  const prompt = buildAiPrompt({
    ticker: "AAPL", session_type: "rth", session_date: "2026-09-24",
    price: 10, change_pct: 1, volume: 100, rvol: null, rvol_class: null,
    key_levels: {}, market_signals: [], recent_events: [], reason_codes: [],
    radar_context: ctx,
  }, catalog);
  const body = buildWatchlistAnthropicBody("claude-haiku-4-5-20251001", prompt);
  const parsed = JSON.parse(JSON.stringify(body)) as {
    messages: Array<{ content: string }>;
  };
  assertEquals(parsed.messages.length, 1);
  assert(typeof parsed.messages[0].content === "string");
  assert(parsed.messages[0].content.includes('"rvol_5m":null'));
  assert(!parsed.messages[0].content.includes("not-a-number"));
  assert(!parsed.messages[0].content.includes("undefined"));
});
