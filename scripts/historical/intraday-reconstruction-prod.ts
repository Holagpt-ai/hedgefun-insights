/**
 * Deep Intraday Reconstruction V1 — SIGNIFICANT/EXTREME episodes, bridge persistence.
 * Requires RADAR_BRIDGE_URL, RADAR_WORKER_SECRET, POLYGON_API_KEY.
 */

import { applyIntradayReconstructionBatch } from "@/lib/intraday-reconstruction/bridge-intraday-batch";
import { reconstructEpisodeIntraday } from "@/lib/intraday-reconstruction/reconstruct-episode-intraday";
import { fetchPolygonMinuteBarsForSession } from "@/lib/intraday-reconstruction/polygon-minute-fetch";
import { HistoricalBridgeClient, requireHistoricalBridgeConfig } from "@/lib/persistence/historical-bridge-client";
import type { SecurityId } from "@/types/security-identity";

const PAGE_LIMIT = Number(process.env.INTRADAY_RECON_PAGE_LIMIT ?? 25);
const MAX_EPISODES = Number(process.env.INTRADAY_RECON_MAX_EPISODES ?? 10_000);
const INCLUDE_RECONSTRUCTED = process.env.INTRADAY_RECON_INCLUDE_EXISTING === "1";

function requirePolygonApiKey(): string {
  const key = (process.env.POLYGON_API_KEY ?? "").trim();
  if (!key) throw new Error("POLYGON_API_KEY is required for intraday reconstruction");
  return key;
}

async function listEligibleEpisodes(bridge: HistoricalBridgeClient): Promise<Array<Record<string, unknown>>> {
  const rows: Record<string, unknown>[] = [];
  let after: string | null = null;
  for (;;) {
    const res = await bridge.call("intraday_reconstruction_list_episodes", {
      after_episode_id: after,
      page_limit: PAGE_LIMIT,
      include_reconstructed: INCLUDE_RECONSTRUCTED,
    });
    const chunk = Array.isArray(res.result)
      ? res.result as Record<string, unknown>[]
      : Array.isArray(res.rows)
        ? res.rows as Record<string, unknown>[]
        : [];
    if (chunk.length === 0) break;
    rows.push(...chunk);
    after = String(chunk[chunk.length - 1]!.episode_id);
    if (chunk.length < PAGE_LIMIT || rows.length >= MAX_EPISODES) break;
  }
  return rows.slice(0, MAX_EPISODES);
}

async function main() {
  const started = Date.now();
  const bridge = new HistoricalBridgeClient(requireHistoricalBridgeConfig());
  const polygonKey = requirePolygonApiKey();
  const computedAt = new Date().toISOString();

  const candidates = await listEligibleEpisodes(bridge);
  let episodesReconstructed = 0;
  let complete = 0;
  let partial = 0;
  let unavailable = 0;
  let dailyOnly = 0;
  let providerErrors = 0;
  let barsProcessed = 0;

  for (const row of candidates) {
    const episodeId = String(row.episode_id);
    const securityId = String(row.security_id) as SecurityId;
    const sessionDate = String(row.session_date).slice(0, 10);
    const symbol = typeof row.observed_symbol === "string" ? row.observed_symbol.trim().toUpperCase() : "";
    if (!symbol) {
      unavailable += 1;
      continue;
    }

    const minuteFetch = await fetchPolygonMinuteBarsForSession({
      symbol,
      sessionDate,
      apiKey: polygonKey,
    });
    if (minuteFetch.error) providerErrors += 1;
    barsProcessed += minuteFetch.bars.length;

    const { facts } = reconstructEpisodeIntraday({
      episodeId,
      securityId,
      sessionDate,
      direction: String(row.direction ?? "MIXED") as "POSITIVE" | "NEGATIVE" | "MIXED",
      dailyOpen: null,
      dailyHigh: null,
      dailyLow: null,
      dailyClose: null,
      dailyVolume: null,
      bars: minuteFetch.bars,
      barGranularity: "1m",
      source: minuteFetch.source,
      sourceAsOf: minuteFetch.sourceAsOf,
      fetchedAt: minuteFetch.fetchedAt,
      computedAt,
    });

    await applyIntradayReconstructionBatch({ bridge, factsRows: [facts] });
    episodesReconstructed += 1;
    if (facts.completenessState === "COMPLETE") complete += 1;
    else if (facts.completenessState === "PARTIAL") partial += 1;
    else if (facts.completenessState === "DAILY_ONLY") dailyOnly += 1;
    else unavailable += 1;
  }

  console.log(JSON.stringify({
    msg: "intraday_reconstruction_complete",
    episodes_eligible: candidates.length,
    episodes_reconstructed: episodesReconstructed,
    complete,
    partial,
    daily_only: dailyOnly,
    unavailable,
    provider_errors: providerErrors,
    bars_processed: barsProcessed,
    elapsed_ms: Date.now() - started,
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({ msg: "intraday_reconstruction_failed", error: String(error) }));
  process.exit(1);
});
