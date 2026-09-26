import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { attachIntradayReconstructionToComparables } from "../intraday-reconstruction/attach-comparables.ts";
import { mapPersistedRowToRepeatMoverEvidence } from "../intraday-reconstruction/repeat-mover-evidence.ts";
import { parseEventReactionLinkRows } from "../episode-event-linkage/bridge-link-rows.ts";
import { attachForwardOutcomesToComparables } from "../forward-outcomes/attach-comparables.ts";
import { attachHistoricalEventsFromStore } from "../episode-event-linkage/attach-events-to-comparables.ts";
import { enrichRepeatMoverComparableEpisodes } from "./enrich-comparable-episodes.ts";

const EPISODE_ID = "11111111-1111-4111-8111-111111111111";

function baseComparable() {
  return {
    episodeId: EPISODE_ID,
    sessionDate: "2025-08-14",
    tier: "NOTABLE",
    direction: "POSITIVE",
    movePct: 10,
    volume: 1_000_000,
    rvol: 2,
    dollarVolume: null,
    closePosition: 0.8,
    nextSessionMovePct: null,
    nextSessionContinuation: null,
    similarity: { sameDirection: true, sameTier: true, movePctDelta: 1 },
  };
}

Deno.test("attach intraday reconstruction when present", () => {
  const [attached] = attachIntradayReconstructionToComparables([baseComparable()], [{
    episode_id: EPISODE_ID,
    completeness_state: "COMPLETE",
    close_vs_hod_pct: -8,
    hod_at: "2025-08-14T15:30:00.000Z",
  }]);
  assertEquals(attached.observedIntradayReconstruction?.closeVsHodPct, -8);
});

Deno.test("skip malformed intraday reconstruction", () => {
  assertEquals(mapPersistedRowToRepeatMoverEvidence({ completeness_state: "BAD" }), null);
  const [attached] = attachIntradayReconstructionToComparables([baseComparable()], [{
    episode_id: EPISODE_ID,
    completeness_state: "BAD",
  }]);
  assertEquals(attached.observedIntradayReconstruction, undefined);
});

Deno.test("attach linked historical events when present", () => {
  const rows = [{
    link_id: "22222222-2222-4222-8222-222222222222",
    event_id: "33333333-3333-4333-8333-333333333333",
    episode_id: EPISODE_ID,
    relation_type: "PRECEDES_EPISODE",
    time_delta_seconds: 3600,
    event_type: "EARNINGS",
    title: "Q2 results",
    published_at: "2025-08-13T20:00:00.000Z",
    event_at: "2025-08-13T20:00:00.000Z",
    event_source: "polygon",
  }];
  const { links, eventsById } = parseEventReactionLinkRows(rows);
  const [attached] = attachHistoricalEventsFromStore([baseComparable()], links, eventsById);
  assertEquals(attached.historicalEvents?.length, 1);
  assertEquals(attached.historicalEvents?.[0]?.title, "Q2 results");
});

Deno.test("skip malformed event link rows", () => {
  const { links } = parseEventReactionLinkRows([{
    link_id: "not-a-uuid",
    event_id: "33333333-3333-4333-8333-333333333333",
    episode_id: EPISODE_ID,
    relation_type: "PRECEDES_EPISODE",
    event_type: "EARNINGS",
    title: "Q2",
  }]);
  assertEquals(links.length, 0);
});

Deno.test("forward outcomes remain intact when intraday/events added", () => {
  const withFo = attachForwardOutcomesToComparables([baseComparable()], [{
    episode_id: EPISODE_ID,
    horizon: "D1",
    data_available: true,
    availability_state: "AVAILABLE",
    return_pct: 3,
    max_gain_pct: 4,
    max_drawdown_pct: -1,
    close_position: 0.7,
    session_volume: 100,
    rvol: 2,
    horizon_session_move_pct: 3,
  }]);
  const [attached] = attachIntradayReconstructionToComparables(withFo, [{
    episode_id: EPISODE_ID,
    completeness_state: "COMPLETE",
    close_vs_hod_pct: -5,
  }]);
  assertEquals(attached.observedForwardOutcomes?.closeToCloseReturnPct.D1, 3);
  assertEquals(attached.observedIntradayReconstruction?.closeVsHodPct, -5);
});

Deno.test("enrich uses three batch rpc calls", async () => {
  let calls = 0;
  const rpc = async (_name: string, _args: Record<string, unknown>) => {
    calls += 1;
    return new Response(JSON.stringify({ ok: true, result: [] }), { status: 200 });
  };
  await enrichRepeatMoverComparableEpisodes({
    comparables: [baseComparable(), { ...baseComparable(), episodeId: "44444444-4444-4444-8444-444444444444" }],
    mostRecentComparableEpisode: null,
    rpc,
  });
  assertEquals(calls, 3);
});

Deno.test("reconstruction rpc failure does not fail enrichment", async () => {
  const rpc = async (name: string, _args: Record<string, unknown>) => {
    if (name.includes("intraday")) {
      return new Response(JSON.stringify({ ok: false }), { status: 502 });
    }
    if (name.includes("forward")) {
      return new Response(JSON.stringify({
        ok: true,
        result: [{
          episode_id: EPISODE_ID,
          horizon: "D1",
          data_available: true,
          availability_state: "AVAILABLE",
          return_pct: 2,
          max_gain_pct: 3,
          max_drawdown_pct: -1,
          close_position: 0.5,
          session_volume: 10,
          rvol: 1,
          horizon_session_move_pct: 2,
        }],
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true, result: [] }), { status: 200 });
  };
  const result = await enrichRepeatMoverComparableEpisodes({
    comparables: [baseComparable()],
    mostRecentComparableEpisode: null,
    rpc,
  });
  assertExists(result.closestComparableEpisodes[0]?.observedForwardOutcomes);
  assertEquals(result.closestComparableEpisodes[0]?.observedIntradayReconstruction, undefined);
});

Deno.test("event rpc failure does not fail enrichment", async () => {
  const rpc = async (name: string, _args: Record<string, unknown>) => {
    if (name.includes("event_reaction")) {
      return new Response(JSON.stringify({ ok: false }), { status: 502 });
    }
    return new Response(JSON.stringify({ ok: true, result: [] }), { status: 200 });
  };
  const result = await enrichRepeatMoverComparableEpisodes({
    comparables: [baseComparable()],
    mostRecentComparableEpisode: null,
    rpc,
  });
  assertEquals(result.closestComparableEpisodes.length, 1);
});
