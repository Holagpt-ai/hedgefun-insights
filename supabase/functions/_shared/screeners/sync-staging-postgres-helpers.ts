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
