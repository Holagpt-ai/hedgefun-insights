import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  collectMainUniverseQualified,
  extendedQuoteSemanticsForTicker,
  finalizeMainUniverseSelections,
  hasPersistedPublicationVolumePair,
  type PolygonTicker,
  qualifiesDayTradeRadar,
  SCREENER_ROW_LIMIT,
  selectMainUniverseTabs,
} from "./selection.ts";
import { expectedVolumeRatio, mapDayTradeRadar, mapTabRows } from "./rows.ts";
import type { GenerationMeta } from "./rows.ts";
import { volumeContextFromOpts } from "./session-volume.ts";
import { MemorySyncStagingStore } from "./sync-staging-memory.ts";
import { emptyChunkArtifacts } from "./sync-staging-types.ts";
import {
  parseContinueDispatchError,
  sanitizeContinueDispatchError,
} from "./sync-finalize-recovery.ts";

function dtrTicker(partial: {
  ticker: string;
  dayV: number;
  prevVol: number;
  price?: number;
  prevClose?: number;
}): PolygonTicker {
  const price = partial.price ?? 10;
  const prevClose = partial.prevClose ?? 8;
  return {
    ticker: partial.ticker,
    todaysChangePerc: 25,
    day: {
      c: price,
      o: price,
      v: partial.dayV,
      h: price * 1.05,
      l: price * 0.95,
    },
    prevDay: { c: prevClose, v: partial.prevVol },
    lastTrade: { p: price },
  };
}

Deno.test("Batch 190.10: Monday premarket DTR drops observation volume unavailable", () => {
  const nowMs = Date.parse("2026-11-02T09:00:00.000Z"); // 04:00 ET Monday (surveillance date rolls at this instant)
  const opts = { nowMs, extendedSession: true, observationSessionFields: true };
  const updated = nowMs * 1_000_000;
  const minT = nowMs;

  const good = dtrTicker({ ticker: "PMGOOD", dayV: 8_000_000, prevVol: 1_000_000 });
  good.updated = updated;
  good.min = { t: minT, av: 8_500_000, o: 10, c: 10.5 };

  const bad = dtrTicker({ ticker: "PMBAD", dayV: 50_000_000, prevVol: 1_000_000 });
  bad.updated = updated;
  bad.min = { t: minT, o: 10, c: 10.5, v: 1000 };
  assertEquals(qualifiesDayTradeRadar(bad), true);
  assertEquals(extendedQuoteSemanticsForTicker(bad, opts), extendedQuoteSemanticsForTicker(good, opts));
  assertEquals(hasPersistedPublicationVolumePair(bad, volumeContextFromOpts(opts)), false);
  assertEquals(hasPersistedPublicationVolumePair(good, volumeContextFromOpts(opts)), true);

  const fill = Array.from({ length: 20 }, (_, i) => {
    const t = dtrTicker({
      ticker: `PMF${String(i).padStart(2, "0")}`,
      dayV: 7_000_000 - i * 10_000,
      prevVol: 1_000_000,
    });
    t.updated = updated;
    t.min = { t: minT, av: 7_100_000 - i * 10_000, o: 10, c: 10.5 };
    return t;
  });

  const universe = [bad, good, ...fill];
  const staged = finalizeMainUniverseSelections(
    collectMainUniverseQualified(universe, opts),
    opts,
  );
  const monolithic = selectMainUniverseTabs(universe, opts);
  for (const selected of [staged.day_trade_radar, monolithic.day_trade_radar]) {
    assertEquals(selected.some((t) => t.ticker === "PMBAD"), false);
    assertEquals(selected.some((t) => t.ticker === "PMGOOD"), true);
    assertEquals(selected.length, SCREENER_ROW_LIMIT);
  }
  assertEquals(
    monolithic.day_trade_radar.map((t) => t.ticker),
    staged.day_trade_radar.map((t) => t.ticker),
  );
});

Deno.test("Batch 190.10: Monday after-hours DTR rejects min.av <= day.v", () => {
  const nowMs = Date.parse("2026-11-02T22:30:00.000Z"); // 17:30 ET Monday
  const opts = { nowMs, extendedSession: true, observationSessionFields: true };
  const updated = (nowMs - 60_000) * 1_000_000;
  const minT = nowMs - 120_000;

  const bad = dtrTicker({ ticker: "AHBAD", dayV: 6_000_000, prevVol: 1_000_000 });
  bad.updated = updated;
  bad.min = { t: minT, av: 6_000_000, o: 10, c: 10.5 };
  assertEquals(hasPersistedPublicationVolumePair(bad, volumeContextFromOpts(opts)), false);

  const good = dtrTicker({ ticker: "AHGOOD", dayV: 5_000_000, prevVol: 1_000_000 });
  good.updated = updated;
  good.min = { t: minT, av: 5_500_000, o: 10, c: 10.5 };
  assertEquals(hasPersistedPublicationVolumePair(good, volumeContextFromOpts(opts)), true);

  const staged = finalizeMainUniverseSelections(
    collectMainUniverseQualified([bad, good], opts),
    opts,
  );
  assertEquals(staged.day_trade_radar.map((t) => t.ticker), ["AHGOOD"]);
});

Deno.test("Batch 190.10: mapped DTR rows satisfy Postgres ratio contract", () => {
  const nowMs = Date.parse("2026-11-02T09:15:00.000Z");
  const opts = { nowMs, extendedSession: true, observationSessionFields: true };
  const meta: GenerationMeta = {
    syncedAt: new Date(nowMs).toISOString(),
    syncRunId: crypto.randomUUID(),
    nowMs,
    extendedSession: opts.extendedSession,
    observationSessionFields: opts.observationSessionFields,
  };
  const updated = (nowMs - 60_000) * 1_000_000;
  const minT = nowMs - 120_000;
  const universe = Array.from({ length: 22 }, (_, i) => {
    const t = dtrTicker({
      ticker: `ROW${i}`,
      dayV: 20_000_000 - i * 100_000,
      prevVol: 1_000_000,
    });
    t.updated = updated;
    t.min = { t: minT, av: 20_100_000 - i * 100_000, o: 10, c: 10.5 };
    return t;
  });
  const selected = selectMainUniverseTabs(universe, opts).day_trade_radar;
  const rows = mapDayTradeRadar(selected, (s) => s, meta);
  for (const row of rows) {
    assertEquals(typeof row.volume, "number");
    assertEquals((row.volume as number) > 0, true);
    assertEquals(Number.isInteger(row.volume), true);
    assertEquals(row.prior_session_volume !== null && row.prior_session_volume! > 0, true);
    assertEquals(row.volume_ratio_prior_session !== null && row.volume_ratio_prior_session! > 0, true);
    assertEquals(
      expectedVolumeRatio(row.volume as number, row.prior_session_volume as number),
      row.volume_ratio_prior_session,
    );
  }
  const otherTabs = mapTabRows("volume_spikes", selected, (s) => s, meta);
  for (const row of otherTabs) {
    assertEquals(row.volume !== null && (row.volume as number) > 0, true);
  }
});

Deno.test("Batch 190.10: parseContinueDispatchError preserves publish reason", () => {
  assertEquals(
    parseContinueDispatchError(409, { error: "state_version_conflict" }),
    "state_version_conflict",
  );
  assertEquals(parseContinueDispatchError(409, { error: "http_409" }), "http_409");
  assertEquals(
    sanitizeContinueDispatchError("'; drop table--"),
    null,
  );
  assertEquals(parseContinueDispatchError(409, null), "http_409");
});

Deno.test("Batch 190.10: terminal failJob reason survives later dispatch record", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.parse("2026-10-31T08:00:00.000Z");
  const id = crypto.randomUUID();
  store.seedJob({
    id,
    status: "finalizing",
    observation: {
      nowMs,
      sessionKind: "pre-market",
      extendedSession: true,
      observationSessionFields: true,
      syncedAt: new Date(nowMs).toISOString(),
      syncRunId: crypto.randomUUID(),
    },
    allTickers: [],
    gainers: [],
    losers: [],
    chunkSize: 100,
    nextChunkIndex: 7,
    totalChunks: 7,
    merged: emptyChunkArtifacts(),
    leaseToken: null,
    leaseExpiresMs: null,
    createdAtMs: nowMs - 120_000,
    updatedAtMs: nowMs,
    nhlBaselineLoaded: false,
    nhlBaselineSnapshot: null,
    stateVersion: 3,
    continueLastAtMs: null,
    continueLastError: null,
    finalizeLeaseToken: "aaaa",
    finalizeLeaseExpiresMs: nowMs + 60_000,
    publishRowsInserted: null,
    publishRpcRecordedAtMs: null,
    abortReason: null,
    abortEvidence: null,
  });
  await store.failJob(id, "state_version_conflict", nowMs);
  await store.recordContinueDispatch({
    jobId: id,
    action: "finalize",
    ok: false,
    error: parseContinueDispatchError(409, null),
    nowMs: nowMs + 1,
  });
  const job = await store.get(id);
  assertEquals(job?.status, "failed");
  assertEquals(job?.continueLastError, "state_version_conflict");
});

Deno.test("Batch 190.10: nonterminal continuation conflict still records dispatch error", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.parse("2026-10-28T14:30:00.000Z");
  const id = crypto.randomUUID();
  store.seedJob({
    id,
    status: "chunking",
    observation: {
      nowMs,
      sessionKind: "market",
      extendedSession: false,
      observationSessionFields: true,
      syncedAt: new Date(nowMs).toISOString(),
      syncRunId: crypto.randomUUID(),
    },
    allTickers: [],
    gainers: [],
    losers: [],
    chunkSize: 100,
    nextChunkIndex: 1,
    totalChunks: 7,
    merged: emptyChunkArtifacts(),
    leaseToken: "lease",
    leaseExpiresMs: nowMs + 60_000,
    createdAtMs: nowMs - 60_000,
    updatedAtMs: nowMs,
    nhlBaselineLoaded: false,
    nhlBaselineSnapshot: null,
    stateVersion: 1,
    continueLastAtMs: null,
    continueLastError: null,
    finalizeLeaseToken: null,
    finalizeLeaseExpiresMs: null,
    publishRowsInserted: null,
    publishRpcRecordedAtMs: null,
    abortReason: null,
    abortEvidence: null,
  });
  await store.recordContinueDispatch({
    jobId: id,
    action: "continue",
    ok: false,
    error: "lease_owner_conflict",
    nowMs,
  });
  const job = await store.get(id);
  assertEquals(job?.status, "chunking");
  assertEquals(job?.continueLastError, "lease_owner_conflict");
});
