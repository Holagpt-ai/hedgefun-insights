import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { HistoricalBackfillEngine } from "@/lib/historical-backfill/engine";
import {
  LOCAL_PILOT_DATABASE_URL,
  openLocalPilotSql,
  resetLocalPilotTables,
} from "@/lib/persistence/local-pilot-database";
import { PostgresSecurityIdentityRepository } from "@/lib/security-identity/postgres-security-identity";
import {
  HistoricalFactConflictError,
  PostgresSecurityIntelligenceRepository,
} from "@/lib/security-intelligence/postgres-security-intelligence";
import type { SecurityIdentityObservation } from "@/types/security-identity";

const sql = openLocalPilotSql(LOCAL_PILOT_DATABASE_URL);
const identity = new PostgresSecurityIdentityRepository(sql);
const intelligence = new PostgresSecurityIntelligenceRepository(sql);
const RECORDED = "2026-09-21T16:00:00.000Z";

function observation(overrides: Partial<SecurityIdentityObservation> = {}): SecurityIdentityObservation {
  return {
    symbol: "INTC",
    exchange: "XNAS",
    effectiveDate: "2021-09-22",
    issuerName: "Intel",
    securityType: "COMMON_STOCK",
    compositeFigi: "BBG000C0G1D1",
    cik: "0000050863",
    source: "polygon-reference",
    provenance: "PROVIDER",
    recordedAt: RECORDED,
    ...overrides,
  };
}

beforeEach(async () => {
  await resetLocalPilotTables(sql);
});

afterAll(async () => {
  await sql.end();
});

describe("local postgres historical persistence", () => {
  it("resolves identity, stores identifiers, and looks up the point-in-time symbol", async () => {
    const created = await identity.resolve(observation());
    expect(created.status).toBe("RESOLVED");
    expect(created.created).toBe(true);
    const again = await identity.resolve(observation({ issuerName: "Different issuer name" }));
    expect(again.created).toBe(false);
    expect(again.securityId).toBe(created.securityId);
    const rows = await sql<{ n: string }[]>`select count(*)::text as n from public.securities`;
    expect(rows[0].n).toBe("1");
    const at = await identity.symbolAt(created.securityId!, "2024-06-03");
    expect(at?.symbol).toBe("INTC");
    const identifiers = await identity.listIdentifiers(created.securityId!);
    expect(identifiers.map((row) => row.kind).sort()).toEqual(["CIK", "COMPOSITE_FIGI"]);
  });

  it("does not merge two securities that only share an issuer name", async () => {
    const first = await identity.resolve(observation({ symbol: "AAA", compositeFigi: "BBG0000000A1", cik: null }));
    const second = await identity.resolve(observation({
      symbol: "BBB",
      exchange: "XNYS",
      compositeFigi: "BBG0000000B2",
      cik: null,
      issuerName: "Intel",
    }));
    expect(second.securityId).not.toBe(first.securityId);
  });

  it("upserts one daily row, rejects a conflicting fact, and does not duplicate an episode", async () => {
    const created = await identity.resolve(observation());
    const securityId = created.securityId!;
    const daily = {
      securityId,
      sessionDate: "2024-06-03",
      observedSymbol: "INTC",
      exchange: "XNAS",
      open: 10,
      high: 11,
      low: 9,
      close: 10.5,
      volume: 1000,
      dollarVolume: 10500,
      previousClose: 10,
      movePct: 5,
      source: "polygon-aggregates",
      provenance: "PROVIDER" as const,
      quality: "AUTHORITATIVE" as const,
      freshness: "UNKNOWN" as const,
    };
    const saved = await intelligence.upsertDailyHistory(daily);
    expect(saved.ok).toBe(true);
    const repeat = await intelligence.upsertDailyHistory(daily);
    expect(repeat.ok && repeat.noop).toBe(true);
    const conflict = await intelligence.upsertDailyHistory({ ...daily, close: 99 });
    expect(conflict.ok).toBe(false);
    const count = await sql<{ n: string }[]>`select count(*)::text as n from public.security_daily_history`;
    expect(count[0].n).toBe("1");

    const episode = {
      securityId,
      episodeStart: "2024-06-03T13:30:00.000Z",
      episodeEnd: "2024-06-03T20:00:00.000Z",
      observedSymbol: "INTC",
      direction: "POSITIVE",
      tier: "NOTABLE",
      volume: 1000,
      origin: "HISTORICAL_BACKFILL",
      detectedBy: "HISTORICAL_DAILY_V1",
      source: "historical-daily-v1",
      provenance: "DERIVED" as const,
      quality: "DERIVED" as const,
      freshness: "UNKNOWN" as const,
      recordedAt: RECORDED,
    };
    const firstEpisode = await intelligence.putEpisode(episode);
    const secondEpisode = await intelligence.putEpisode(episode);
    expect(firstEpisode.ok && secondEpisode.ok && firstEpisode.record.episodeId === secondEpisode.record.episodeId).toBe(true);
    const episodes = await sql<{ n: string }[]>`select count(*)::text as n from public.market_behavior_episodes`;
    expect(episodes[0].n).toBe("1");
  });

  it("resumes from the stored checkpoint and a second run does not duplicate rows", async () => {
    const created = await identity.resolve(observation({ effectiveDate: "2024-06-03" }));
    const securityId = created.securityId!;
    const provider = {
      fetchDailyBars: async (request: { dateFrom: string; dateTo: string }) => ({
        coverage: "SUPPORTED" as const,
        bars: [
          { sessionDate: "2024-06-03", open: 10, high: 11, low: 9, close: 10, volume: 100 },
          { sessionDate: "2024-06-04", open: 10, high: 12, low: 9, close: 12, volume: 100 },
        ].filter((bar) => bar.sessionDate >= request.dateFrom && bar.sessionDate <= request.dateTo),
        source: "fixture",
        sourceAsOf: null,
        fetchedAt: null,
        error: null,
        complete: true,
      }),
    };
    const first = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider,
      config: { dateChunkDays: 1, maxChunksPerRun: 1, retryCount: 0, verifiedEarliestDailyDate: "2021-09-22" },
    });
    const started = await first.start({
      securities: [{ securityId }],
      completedSessionDate: "2024-06-04",
      dateFrom: "2024-06-03",
      dateTo: "2024-06-04",
      recordedAt: RECORDED,
    });
    if (!started.ok) throw new Error(started.reason);
    const partial = await first.runBatch(started.record.jobId, "2026-09-21T16:05:00.000Z");
    expect(partial.state).toBe("RUNNING");
    expect(partial.cursorToken).toBe("0:2024-06-04");
    const second = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider,
      config: { dateChunkDays: 1, maxChunksPerRun: 5, retryCount: 0, verifiedEarliestDailyDate: "2021-09-22" },
    });
    await second.resume(started.record.jobId, "2026-09-21T16:06:00.000Z");
    const finished = await second.runBatch(started.record.jobId, "2026-09-21T16:07:00.000Z");
    expect(finished.state).toBe("COMPLETE");
    expect(finished.rowsWritten).toBe(2);
    const rows = await sql<{ n: string }[]>`select count(*)::text as n from public.security_daily_history`;
    expect(rows[0].n).toBe("2");

    const replay = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider,
      config: { dateChunkDays: 5, maxChunksPerRun: 2, retryCount: 0, verifiedEarliestDailyDate: "2021-09-22" },
    });
    const replayed = await replay.start({
      securities: [{ securityId }],
      completedSessionDate: "2024-06-04",
      dateFrom: "2024-06-03",
      dateTo: "2024-06-04",
      recordedAt: "2026-09-21T16:08:00.000Z",
    });
    if (!replayed.ok) throw new Error(replayed.reason);
    const stats = await replay.runBatch(replayed.record.jobId, "2026-09-21T16:09:00.000Z");
    expect(stats.duplicateRows).toBe(2);
    expect(stats.rowsWritten).toBe(0);
    const after = await sql<{ n: string }[]>`select count(*)::text as n from public.security_daily_history`;
    expect(after[0].n).toBe("2");
  });

  it("flushes daily rows in bounded batches and rolls a conflict back", async () => {
    const created = await identity.resolve(observation());
    const securityId = created.securityId!;
    const batched = new PostgresSecurityIntelligenceRepository(sql, 2);
    const row = (sessionDate: string, close = 10) => ({
      securityId,
      sessionDate,
      observedSymbol: "INTC",
      exchange: "XNAS",
      open: 10,
      high: 11,
      low: 9,
      close,
      volume: 1000,
      dollarVolume: null,
      previousClose: null,
      movePct: null,
      source: "polygon-aggregates",
      provenance: "PROVIDER" as const,
      quality: "AUTHORITATIVE" as const,
      freshness: "UNKNOWN" as const,
    });
    await batched.transaction(async () => {
      await batched.upsertDailyHistory(row("2024-06-03"));
      await batched.upsertDailyHistory(row("2024-06-04"));
      await batched.upsertDailyHistory(row("2024-06-05"));
    });
    const count = await sql<{ n: string; nulls: string }[]>`
      select count(*)::text as n,
             count(*) filter (where previous_close is null and move_pct is null)::text as nulls
      from public.security_daily_history
    `;
    expect(count[0].n).toBe("3");
    expect(count[0].nulls).toBe("3");
    expect(batched.writeProfile.dailyInsertStatements).toBe(2);
    expect(batched.writeProfile.dailyInsertRows).toBe(3);

    const job = await batched.createBackfillJob({
      jobType: "SECURITY_DAILY_HISTORY",
      dateFrom: "2024-06-03",
      dateTo: "2024-06-05",
      recordedAt: RECORDED,
    });
    if (!job.ok) throw new Error(job.reason);
    await expect(batched.transaction(async () => {
      await batched.upsertDailyHistory(row("2024-06-06"));
      await batched.upsertDailyHistory(row("2024-06-03", 99));
    })).rejects.toThrow(HistoricalFactConflictError);
    const after = await sql<{ n: string }[]>`select count(*)::text as n from public.security_daily_history`;
    expect(after[0].n).toBe("3");
    const storedJob = await batched.getJob(job.record.jobId);
    expect(storedJob?.cursorToken).toBeNull();
  });
});
