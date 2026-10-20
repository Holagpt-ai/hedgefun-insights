/**
 * Shared fetch + canonical mapping for public market-mover pages and homepage tables.
 */

import { getTopGainers, getTopLosers } from "@/lib/polygon";
import { classifyTrackedAfterHoursMovers, type SnapshotTicker } from "@/lib/market-session";
import { resolveMarketSession, type MarketSessionLabel } from "@/lib/price-utils";
import { supabase } from "@/integrations/supabase/client";
import {
  mapAfterHoursFeedDetailed,
  mapPolygonMoversDetailed,
  mapTrackedMostActiveMovers,
  moverFromExtendedObservation,
  polygonTickersFromResponse,
  selectCanonicalCurrentMovers,
  toMoverListRow,
  SOURCE_POLYGON,
  type CanonicalMover,
  type MoverListRow,
  type MoverSession,
} from "./movers-integrity";
import {
  summarizeMoversListProvenance,
  type MoversListProvenance,
  type MoverUniverseKind,
} from "./movers-provenance";

export function clockSessionToMoverSession(session: MarketSessionLabel): MoverSession {
  if (session === "pre-market") return "premarket";
  if (session === "after-hours") return "afterhours";
  return "regular";
}

export interface MoversPageQueryResult {
  rows: MoverListRow[];
  movers: CanonicalMover[];
  provenance: MoversListProvenance;
}

export function homepagePublicMoversQueryKey(
  session: MarketSessionLabel,
  sessionDate: string,
): readonly ["homepage-public-movers", MarketSessionLabel, string] {
  return ["homepage-public-movers", session, sessionDate] as const;
}

async function fetchAfterHoursSnapshots(): Promise<{
  gainers: SnapshotTicker[];
  losers: SnapshotTicker[];
}> {
  const [gainRes, lossRes] = await Promise.all([getTopGainers(), getTopLosers()]);
  return {
    gainers: polygonTickersFromResponse(gainRes) as SnapshotTicker[],
    losers: polygonTickersFromResponse(lossRes) as SnapshotTicker[],
  };
}

function mapAfterHoursTrackedSide(
  snapshots: { gainers: SnapshotTicker[]; losers: SnapshotTicker[] },
  side: "gainers" | "losers",
  nowMs: number,
  sort: "percent_desc" | "percent_asc",
): MoversPageQueryResult {
  const classified = classifyTrackedAfterHoursMovers([
    ...snapshots.gainers,
    ...snapshots.losers,
  ]);
  const sourceRows = side === "gainers" ? classified.gainers : classified.losers;
  const validated = sourceRows.map((r) =>
    moverFromExtendedObservation({
      symbol: r.symbol,
      name: r.name,
      extendedLast: r.extended_last,
      regularClose: r.regular_close,
      volume: r.volume,
      changePercent: r.changePercent,
      source: SOURCE_POLYGON,
    }, nowMs),
  );
  const movers = selectCanonicalCurrentMovers(validated, { sort });
  const rows = movers.map(toMoverListRow).filter((r): r is MoverListRow => r !== null);
  const provenance = summarizeMoversListProvenance(movers, {
    nowMs,
    universe: "tracked_gainers_losers",
    moverSession: "afterhours",
  });
  return { rows, movers, provenance };
}

async function fetchAfterHoursTracked(
  side: "gainers" | "losers",
  nowMs: number,
  sort: "percent_desc" | "percent_asc",
): Promise<MoversPageQueryResult> {
  return mapAfterHoursTrackedSide(await fetchAfterHoursSnapshots(), side, nowMs, sort);
}

async function fetchPolygonSide(
  kind: "gainers" | "losers",
  session: MarketSessionLabel,
  nowMs: number,
): Promise<MoversPageQueryResult> {
  const res = kind === "gainers" ? await getTopGainers() : await getTopLosers();
  const moverSession = clockSessionToMoverSession(session);
  const sort = kind === "gainers" ? "percent_desc" : "percent_asc";
  const { rows, movers } = mapPolygonMoversDetailed(res, moverSession, { sort, nowMs });
  const universe: MoverUniverseKind = kind === "gainers" ? "top_gainers" : "top_losers";
  const provenance = summarizeMoversListProvenance(movers, {
    nowMs,
    universe,
    moverSession,
    premarket: session === "pre-market",
  });
  return { rows, movers, provenance };
}

export async function fetchPublicGainersRows(session = resolveMarketSession()): Promise<MoversPageQueryResult> {
  const nowMs = Date.now();
  if (session === "after-hours") {
    return fetchAfterHoursTracked("gainers", nowMs, "percent_desc");
  }
  return fetchPolygonSide("gainers", session, nowMs);
}

export async function fetchPublicLosersRows(session = resolveMarketSession()): Promise<MoversPageQueryResult> {
  const nowMs = Date.now();
  if (session === "after-hours") {
    return fetchAfterHoursTracked("losers", nowMs, "percent_asc");
  }
  return fetchPolygonSide("losers", session, nowMs);
}

export async function fetchPublicMostActiveRows(session = resolveMarketSession()): Promise<MoversPageQueryResult> {
  const nowMs = Date.now();
  const moverSession = clockSessionToMoverSession(session);
  const [gainers, losers] = await Promise.all([getTopGainers(), getTopLosers()]);
  const { rows, movers } = mapTrackedMostActiveMovers(gainers, losers, moverSession, { nowMs });
  const provenance = summarizeMoversListProvenance(movers, {
    nowMs,
    universe: "tracked_gainers_losers",
    moverSession,
  });
  return { rows, movers, provenance };
}

export async function fetchHomepagePublicMoversBundle(
  session: MarketSessionLabel = resolveMarketSession(),
): Promise<{
  gainers: MoversPageQueryResult;
  losers: MoversPageQueryResult;
  combinedProvenance: MoversListProvenance;
  fetchedAtMs: number;
}> {
  const nowMs = Date.now();
  const [gainers, losers] = session === "after-hours"
    ? await (async () => {
      const snapshots = await fetchAfterHoursSnapshots();
      return [
        mapAfterHoursTrackedSide(snapshots, "gainers", nowMs, "percent_desc"),
        mapAfterHoursTrackedSide(snapshots, "losers", nowMs, "percent_asc"),
      ] as const;
    })()
    : await Promise.all([
      fetchPublicGainersRows(session),
      fetchPublicLosersRows(session),
    ]);
  const moverSession = clockSessionToMoverSession(session);
  const combinedProvenance = summarizeMoversListProvenance(
    [...gainers.movers, ...losers.movers],
    {
      nowMs,
      universe: "tracked_gainers_losers",
      moverSession,
      premarket: session === "pre-market",
    },
  );
  return { gainers, losers, combinedProvenance, fetchedAtMs: nowMs };
}

export async function fetchPremarketGainersRows(nowMs = Date.now()): Promise<MoversPageQueryResult> {
  const res = await getTopGainers();
  const { rows, movers } = mapPolygonMoversDetailed(res, "premarket", { sort: "percent_desc", nowMs });
  const provenance = summarizeMoversListProvenance(movers, {
    nowMs,
    universe: "top_gainers",
    moverSession: "premarket",
    premarket: true,
  });
  return { rows, movers, provenance };
}

export async function fetchPremarketLosersRows(nowMs = Date.now()): Promise<MoversPageQueryResult> {
  const res = await getTopLosers();
  const { rows, movers } = mapPolygonMoversDetailed(res, "premarket", { sort: "percent_asc", nowMs });
  const provenance = summarizeMoversListProvenance(movers, {
    nowMs,
    universe: "top_losers",
    moverSession: "premarket",
    premarket: true,
  });
  return { rows, movers, provenance };
}

const AFTER_HOURS_ROW_LIMIT = 41;

async function fetchAfterHoursFeedRows(nowMs: number): Promise<MoversPageQueryResult> {
  const { data: stateRows, error: stateError } = await supabase
    .from("after_hours_feed_state")
    .select("state_key,generation_id,status")
    .eq("state_key", "current")
    .limit(1);
  if (stateError) throw new Error(stateError.message);

  const gen = (stateRows ?? [])[0]?.generation_id;
  if (!gen) {
    return {
      rows: [],
      movers: [],
      provenance: summarizeMoversListProvenance([], {
        nowMs,
        universe: "after_hours_feed",
        moverSession: "afterhours",
      }),
    };
  }

  const { data: resultRows, error: rowsError } = await supabase
    .from("after_hours_mover_results")
    .select("generation_id,side,rank,symbol,company_name,extended_last,regular_close,change_percent,volume,provider_as_of")
    .eq("generation_id", gen)
    .order("side", { ascending: true })
    .order("rank", { ascending: true })
    .limit(AFTER_HOURS_ROW_LIMIT);
  if (rowsError) throw new Error(rowsError.message);

  const { rows, movers } = mapAfterHoursFeedDetailed(resultRows ?? [], { nowMs, sort: "percent_desc" });
  const provenance = summarizeMoversListProvenance(movers, {
    nowMs,
    universe: "after_hours_feed",
    moverSession: "afterhours",
  });
  return { rows, movers, provenance };
}

/** Legacy `/movers/:type` alias — same session rules as `/markets/*`. */
export async function fetchLegacyMoversRoute(
  type: string,
  clockSession: MarketSessionLabel = resolveMarketSession(),
): Promise<MoversPageQueryResult> {
  if (type === "afterhours") {
    return fetchAfterHoursFeedRows(Date.now());
  }
  if (type === "premarket") {
    return fetchPremarketGainersRows();
  }
  if (type === "active") {
    return fetchPublicMostActiveRows(clockSession);
  }
  if (type === "losers") {
    return fetchPublicLosersRows(clockSession);
  }
  return fetchPublicGainersRows(clockSession);
}
