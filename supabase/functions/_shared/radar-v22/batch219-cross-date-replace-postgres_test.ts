import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import { withPg } from "../screeners/sync-staging-postgres-helpers.ts";

const NOV9 = "2026-11-09";
const NOV10 = "2026-11-10";
const SYNC9 = "2026-11-09T23:59:00.000Z";
const SYNC10 = "2026-11-10T14:30:00.000Z";
const GEN9 = "11111111-1111-4111-8111-111111111111";
const GEN10 = "22222222-2222-4222-8222-222222222222";
const GEN_STALE = "33333333-3333-4333-8333-333333333333";

function minimalCandidate(input: {
  generationId: string;
  tradingDate: string;
  sessionKind: string;
  symbol: string;
  syncedAt: string;
}): Record<string, unknown> {
  return {
    generation_id: input.generationId,
    trading_date: input.tradingDate,
    session_kind: input.sessionKind,
    symbol: input.symbol,
    lifecycle: "ACTIVE",
    signal_status: "ACTIVE",
    last_price: 10.5,
    last_price_at: input.syncedAt,
    move_15s_pct: 0.1,
    move_60s_pct: 0.2,
    volume_5s: 100,
    volume_15s: 200,
    volume_60s: 300,
    session_volume: 10000,
    dollar_volume_60s: 5000,
    session_high: 11,
    session_low: 9,
    distance_from_hod_pct: 1,
    session_vwap: 10.2,
    vwap_side: "above",
    geometry_partial: false,
    vwap_partial: false,
    freshness_class: "fresh",
    freshness_age_ms: 1000,
    scanner_events: [],
    updated_at: input.syncedAt,
  };
}

async function callReplace(
  client: Client,
  input: {
    generationId: string;
    tradingDate: string;
    sessionKind: string;
    syncedAt: string;
    candidates: unknown[];
    events?: unknown[];
  },
): Promise<{ applied: boolean; reason: string | null; inserted: number }> {
  const res = await client.queryObject<{
    replace_radar_v22_candidates_v1: { applied: boolean; reason: string; inserted: number };
  }>(
    `SELECT public.replace_radar_v22_candidates_v1(
      $1::uuid,
      $2::date,
      $3::text,
      $4::timestamptz,
      $5::jsonb,
      $6::jsonb,
      true,
      $4::timestamptz,
      $4::timestamptz
    ) AS replace_radar_v22_candidates_v1`,
    [
      input.generationId,
      input.tradingDate,
      input.sessionKind,
      input.syncedAt,
      JSON.stringify(input.candidates),
      JSON.stringify(input.events ?? []),
    ],
  );
  const row = res.rows[0]?.replace_radar_v22_candidates_v1;
  assertExists(row);
  return {
    applied: row.applied,
    reason: row.reason ?? null,
    inserted: row.inserted,
  };
}

Deno.test({
  name: "postgres: cross-date replace clears prior symbol rows before insert",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await client.queryObject(
        `DELETE FROM public.radar_v22_events;
         DELETE FROM public.radar_v22_candidates;
         DELETE FROM public.radar_v22_closed_snapshot;
         DELETE FROM public.radar_v22_carryover_snapshot;
         DELETE FROM public.radar_v22_feed_state WHERE state_key = 'current';`,
      );

      const nov9 = await callReplace(client, {
        generationId: GEN9,
        tradingDate: NOV9,
        sessionKind: "after-hours",
        syncedAt: SYNC9,
        candidates: [minimalCandidate({
          generationId: GEN9,
          tradingDate: NOV9,
          sessionKind: "after-hours",
          symbol: "ABC",
          syncedAt: SYNC9,
        })],
        events: [{
          trading_date: NOV9,
          session_kind: "after-hours",
          symbol: "ABC",
          event_type: "PROMOTED",
          event_at: SYNC9,
          generation_id: GEN9,
        }],
      });
      assertEquals(nov9.applied, true);
      assertEquals(nov9.reason, "replaced");

      const countNov9 = await client.queryObject<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.radar_v22_candidates WHERE symbol = 'ABC'`,
      );
      assertEquals(countNov9.rows[0]?.n, 1);

      const nov10 = await callReplace(client, {
        generationId: GEN10,
        tradingDate: NOV10,
        sessionKind: "market",
        syncedAt: SYNC10,
        candidates: [minimalCandidate({
          generationId: GEN10,
          tradingDate: NOV10,
          sessionKind: "market",
          symbol: "ABC",
          syncedAt: SYNC10,
        })],
      });
      assertEquals(nov10.applied, true);
      assertEquals(nov10.reason, "replaced");
      assertEquals(nov10.inserted, 1);

      const cand = await client.queryObject<{ trading_date: string; session_kind: string }>(
        `SELECT trading_date::text, session_kind FROM public.radar_v22_candidates WHERE symbol = 'ABC'`,
      );
      assertEquals(cand.rows.length, 1);
      assertEquals(cand.rows[0]?.trading_date, NOV10);
      assertEquals(cand.rows[0]?.session_kind, "market");

      const feed = await client.queryObject<{
        session_date: string;
        session_kind: string;
        v2_synced_at: string;
        v2_generation_id: string;
      }>(
        `SELECT session_date::text, session_kind, v2_synced_at::text, v2_generation_id::text
         FROM public.radar_v22_feed_state WHERE state_key = 'current'`,
      );
      assertEquals(feed.rows[0]?.session_date, NOV10);
      assertEquals(feed.rows[0]?.session_kind, "market");
      assertEquals(feed.rows[0]?.v2_generation_id, GEN10);
      assertEquals(feed.rows[0]?.v2_synced_at?.startsWith("2026-11-10"), true);

      const events = await client.queryObject<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.radar_v22_events
         WHERE symbol = 'ABC' AND trading_date = $1::date`,
        [NOV9],
      );
      assertEquals(events.rows[0]?.n, 1);
    });
  },
});

Deno.test({
  name: "postgres: stale_generation leaves committed generation intact",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await client.queryObject(
        `DELETE FROM public.radar_v22_candidates;
         DELETE FROM public.radar_v22_feed_state WHERE state_key = 'current';`,
      );
      await callReplace(client, {
        generationId: GEN10,
        tradingDate: NOV10,
        sessionKind: "market",
        syncedAt: SYNC10,
        candidates: [minimalCandidate({
          generationId: GEN10,
          tradingDate: NOV10,
          sessionKind: "market",
          symbol: "XYZ",
          syncedAt: SYNC10,
        })],
      });
      const stale = await callReplace(client, {
        generationId: GEN_STALE,
        tradingDate: NOV10,
        sessionKind: "market",
        syncedAt: "2026-11-10T14:00:00.000Z",
        candidates: [minimalCandidate({
          generationId: GEN_STALE,
          tradingDate: NOV10,
          sessionKind: "market",
          symbol: "XYZ",
          syncedAt: "2026-11-10T14:00:00.000Z",
        })],
      });
      assertEquals(stale.applied, false);
      assertEquals(stale.reason, "stale_generation");

      const row = await client.queryObject<{ generation_id: string }>(
        `SELECT generation_id::text FROM public.radar_v22_candidates WHERE symbol = 'XYZ'`,
      );
      assertEquals(row.rows[0]?.generation_id, GEN10);
    });
  },
});

Deno.test({
  name: "postgres: validation failure rolls back prior candidate generation",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await client.queryObject(
        `DELETE FROM public.radar_v22_candidates;
         DELETE FROM public.radar_v22_feed_state WHERE state_key = 'current';`,
      );
      await callReplace(client, {
        generationId: GEN9,
        tradingDate: NOV9,
        sessionKind: "after-hours",
        syncedAt: SYNC9,
        candidates: [minimalCandidate({
          generationId: GEN9,
          tradingDate: NOV9,
          sessionKind: "after-hours",
          symbol: "LMN",
          syncedAt: SYNC9,
        })],
      });
      let threw = false;
      try {
        await callReplace(client, {
          generationId: GEN10,
          tradingDate: NOV10,
          sessionKind: "market",
          syncedAt: SYNC10,
          candidates: [{
            ...minimalCandidate({
              generationId: "99999999-9999-4999-8999-999999999999",
              tradingDate: NOV10,
              sessionKind: "market",
              symbol: "LMN",
              syncedAt: SYNC10,
            }),
          }],
        });
      } catch {
        threw = true;
      }
      assertEquals(threw, true);
      const row = await client.queryObject<{ trading_date: string }>(
        `SELECT trading_date::text FROM public.radar_v22_candidates WHERE symbol = 'LMN'`,
      );
      assertEquals(row.rows[0]?.trading_date, NOV9);
    });
  },
});
