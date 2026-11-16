import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

export function pgTestUrl(): string {
  const url = Deno.env.get("SCREENER_SYNC_PG_TEST_URL") ?? "";
  if (!url) {
    throw new Error(
      "SCREENER_SYNC_PG_TEST_URL is required for Postgres integration tests",
    );
  }
  if (/lovable|supabase\.co|zcjptaolpumhtlwhlemq/i.test(url)) {
    throw new Error("Refusing Postgres integration tests against production-like host");
  }
  return url;
}

export async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client(pgTestUrl());
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function truncateStaging(client: Client): Promise<void> {
  await client.queryObject(`DELETE FROM public.screener_sync_generation_jobs`);
  await client.queryObject(`DELETE FROM public.screener_results`);
  await client.queryObject(`DELETE FROM public.screener_feed_state`);
}

export function sampleObservation(syncRunId: string) {
  return {
    nowMs: Date.now(),
    sessionKind: "regular",
    extendedSession: false,
    observationSessionFields: true,
    syncedAt: new Date().toISOString(),
    syncRunId,
  };
}

export function validScreenerRow(
  symbol: string,
  tabId = "day_trade_radar",
  providerAsOf = "2026-10-28T14:00:00.000Z",
) {
  return {
    tab_id: tabId,
    symbol,
    company_name: symbol,
    price: "10",
    change_percent: "1.5",
    volume: "1000000",
    prior_session_volume: "500000",
    volume_ratio_prior_session: "2",
    provider_as_of: providerAsOf,
  };
}

export function sampleTabEvidence() {
  return {
    day_trade_radar: {
      prerequisite_status: "evaluated",
      universe_count: 1,
      qualified_count: 1,
    },
  };
}

/** Six-tab evaluated evidence for Layer C publish/complete gates. */
export function layerCSixTabEvidenceEvaluated() {
  const simple = {
    status: "evaluated" as const,
    universe_count: 1,
    qualified_count: 1,
    selected_count: 1,
  };
  return {
    day_trade_radar: simple,
    gappers: {
      status: "evaluated" as const,
      universe_count: 1,
      volume_positive_count: 1,
      gap_calculable_count: 1,
      no_prior_session_count: 0,
      split_scale_suppressed_count: 0,
      unresolved_gap_input_count: 0,
      qualified_count: 1,
      selected_count: 1,
    },
    gainers_losers: simple,
    new_highs_lows: {
      status: "evaluated" as const,
      baseline_status: "available" as const,
      baseline_quote_count: 1,
      universe_count: 1,
      evaluated_count: 1,
      qualified_count: 1,
      selected_count: 1,
      policy_excluded_count: 0,
      no_history_count: 0,
      unresolved_count: 0,
    },
    volume_spikes: simple,
    unusual_volume: simple,
  };
}

export async function insertChunkingJob(
  client: Client,
  input: {
    jobId: string;
    syncRunId: string;
    totalChunks: number;
    nextChunkIndex?: number;
    leaseToken?: string;
    stateVersion?: number;
  },
): Promise<void> {
  const observation = sampleObservation(input.syncRunId);
  await client.queryObject(
    `INSERT INTO public.screener_sync_generation_jobs
     (id, sync_run_id, status, observation, all_tickers, chunk_size, next_chunk_index,
      total_chunks, merged_artifacts, lease_token, lease_expires_at, state_version)
     VALUES ($1, $2, 'chunking', $3::jsonb, '[]'::jsonb, 2200, $4, $5, '{}'::jsonb,
             $6::uuid, now() + interval '12 minutes', $7)`,
    [
      input.jobId,
      input.syncRunId,
      JSON.stringify(observation),
      input.nextChunkIndex ?? 0,
      input.totalChunks,
      input.leaseToken ?? crypto.randomUUID(),
      input.stateVersion ?? 0,
    ],
  );
}
