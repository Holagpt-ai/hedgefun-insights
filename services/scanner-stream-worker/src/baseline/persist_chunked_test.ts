import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  chunkItemsByRequestBytes,
  serializedRequestBytes,
  STAGED_CHUNK_MAX_ITEMS,
  STAGED_CHUNK_SAFETY_BYTES,
  STAGED_CHUNK_TARGET_BYTES,
} from "./chunk.ts";
import type {
  AppendExclusionsArgs,
  AppendRowsArgs,
  BaselineRow,
  FinalizePublishArgs,
  StartPublishArgs,
  StagedPublishClient,
} from "./persist.ts";
import {
  publishGenerationStaged,
  wrapAppendExclusionsRequest,
  wrapAppendRowsRequest,
} from "./persist.ts";
import type { BaselineExclusionPayload } from "../../../../supabase/functions/_shared/screeners/baseline-exclusion-publish.ts";

const GEN = "11111111-2222-3333-4444-555555555555";
const OTHER_GEN = "22222222-3333-4444-5555-666666666666";
const PRIOR_GEN = "d91f69ba-0000-0000-0000-000000000001";
const AS_OF = "2026-08-12T20:00:01.000Z";
const START = "2025-08-10";
const END = "2026-08-10";
const PRODUCTION_ONE_SHOT_BYTES = 14_789_625;

function validRow(
  symbol: string,
  overrides: Partial<BaselineRow> = {},
): BaselineRow {
  return {
    symbol,
    period_start: START,
    period_end: END,
    high_52w: 12,
    low_52w: 4,
    high_candidates: [
      { d: "2026-08-11", v: 12 },
      { d: "2026-08-12", v: 9 },
    ],
    low_candidates: [
      { d: "2026-08-11", v: 4 },
      { d: "2026-08-12", v: 7 },
    ],
    sessions_observed: 120,
    provider_as_of: AS_OF,
    ...overrides,
  };
}

function validExclusion(
  symbol: string,
  overrides: Partial<BaselineExclusionPayload> = {},
): BaselineExclusionPayload {
  return {
    symbol,
    reason: "insufficient_sessions",
    sessions_observed: 40,
    min_sessions: 120,
    ...overrides,
  };
}

function fatRow(symbol: string, candidateCount: number): BaselineRow {
  const high = Array.from({ length: candidateCount }, (_, i) => ({
    d: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
    v: 100 - i * 0.01,
  }));
  const low = Array.from({ length: candidateCount }, (_, i) => ({
    d: `2026-02-${String((i % 28) + 1).padStart(2, "0")}`,
    v: 10 + i * 0.01,
  }));
  return validRow(symbol, {
    high_52w: high[0].v,
    low_52w: low[0].v,
    high_candidates: high,
    low_candidates: low,
    sessions_observed: 180,
  });
}

function symbolAt(index: number): string {
  return `S${index.toString(16).toUpperCase().padStart(4, "0")}`;
}

function sameBaselineRow(left: BaselineRow, right: BaselineRow): boolean {
  return left.symbol === right.symbol &&
    left.period_start === right.period_start &&
    left.period_end === right.period_end &&
    left.high_52w === right.high_52w &&
    left.low_52w === right.low_52w &&
    JSON.stringify(left.high_candidates) === JSON.stringify(right.high_candidates) &&
    JSON.stringify(left.low_candidates) === JSON.stringify(right.low_candidates) &&
    left.sessions_observed === right.sessions_observed &&
    left.provider_as_of === right.provider_as_of;
}

function sameExclusion(
  left: BaselineExclusionPayload,
  right: BaselineExclusionPayload,
): boolean {
  return left.symbol === right.symbol &&
    left.reason === right.reason &&
    left.sessions_observed === right.sessions_observed &&
    left.min_sessions === right.min_sessions;
}

type ProductionPointer = {
  generation_id: string | null;
  status: "available" | "empty" | "initializing" | "unavailable";
  symbol_count: number;
  policy_min_sessions: number | null;
  policy_excluded_count: number | null;
  published_baseline_count: number;
  published_exclusion_count: number;
};

class MemoryStagingStore {
  job: StartPublishArgs | null = null;
  rows = new Map<string, BaselineRow>();
  exclusions = new Map<string, BaselineExclusionPayload>();
  production: ProductionPointer = {
    generation_id: PRIOR_GEN,
    status: "available",
    symbol_count: 1,
    policy_min_sessions: null,
    policy_excluded_count: null,
    published_baseline_count: 1,
    published_exclusion_count: 0,
  };
  replaceCalls = 0;
  startCalls = 0;
  rowAppendCalls = 0;
  exclusionAppendCalls = 0;
  finalizeCalls = 0;
  lastFinalizeSymbolCount: number | null = null;

  start(args: StartPublishArgs): { error: { message: string } | null } {
    this.startCalls += 1;
    if (this.job && this.job.p_generation_id === args.p_generation_id) {
      if (
        this.job.p_period_start !== args.p_period_start ||
        this.job.p_period_end !== args.p_period_end ||
        this.job.p_provider_as_of !== args.p_provider_as_of ||
        this.job.p_expected_baseline_count !== args.p_expected_baseline_count ||
        this.job.p_expected_exclusion_count !== args.p_expected_exclusion_count ||
        this.job.p_min_sessions !== args.p_min_sessions
      ) {
        return { error: { message: "generation metadata mismatch" } };
      }
      return { error: null };
    }
    this.rows.clear();
    this.exclusions.clear();
    this.job = { ...args };
    return { error: null };
  }

  appendRows(args: AppendRowsArgs): { error: { message: string } | null } {
    this.rowAppendCalls += 1;
    if (!this.job || this.job.p_generation_id !== args.p_generation_id) {
      return { error: { message: "wrong generation" } };
    }
    for (const row of args.p_rows) {
      const existing = this.rows.get(row.symbol);
      if (existing && !sameBaselineRow(existing, row)) {
        return { error: { message: "conflicting staged baseline row" } };
      }
      this.rows.set(row.symbol, row);
    }
    return { error: null };
  }

  appendExclusions(
    args: AppendExclusionsArgs,
  ): { error: { message: string } | null } {
    this.exclusionAppendCalls += 1;
    if (!this.job || this.job.p_generation_id !== args.p_generation_id) {
      return { error: { message: "wrong generation" } };
    }
    for (const exclusion of args.p_exclusions) {
      const existing = this.exclusions.get(exclusion.symbol);
      if (existing && !sameExclusion(existing, exclusion)) {
        return { error: { message: "conflicting staged exclusion" } };
      }
      this.exclusions.set(exclusion.symbol, exclusion);
    }
    return { error: null };
  }

  replayIfAlreadyCurrent(
    generationId: string,
  ): { error: { message: string } | null } {
    if (
      this.production.generation_id === generationId &&
      (this.production.status === "available" ||
        this.production.status === "empty") &&
      this.production.policy_min_sessions != null &&
      this.production.policy_excluded_count != null &&
      this.production.published_baseline_count ===
        this.production.symbol_count &&
      this.production.published_exclusion_count ===
        this.production.policy_excluded_count
    ) {
      this.lastFinalizeSymbolCount = this.production.symbol_count;
      return { error: null };
    }
    return { error: { message: "wrong generation" } };
  }

  finalize(args: FinalizePublishArgs): { error: { message: string } | null } {
    this.finalizeCalls += 1;
    if (!this.job || this.job.p_generation_id !== args.p_generation_id) {
      return this.replayIfAlreadyCurrent(args.p_generation_id);
    }
    if (this.rows.size !== this.job.p_expected_baseline_count) {
      return { error: { message: "expected/actual baseline count mismatch" } };
    }
    if (this.exclusions.size !== this.job.p_expected_exclusion_count) {
      return { error: { message: "expected/actual exclusion count mismatch" } };
    }
    for (const symbol of this.rows.keys()) {
      if (this.exclusions.has(symbol)) {
        return { error: { message: "exclusion symbol overlaps baseline" } };
      }
    }
    for (const row of this.rows.values()) {
      if (row.sessions_observed < this.job.p_min_sessions) {
        return { error: { message: "invalid baseline session counts" } };
      }
    }
    for (const exclusion of this.exclusions.values()) {
      if (
        exclusion.reason !== "insufficient_sessions" ||
        exclusion.sessions_observed < 1 ||
        exclusion.sessions_observed >= this.job.p_min_sessions ||
        exclusion.min_sessions !== this.job.p_min_sessions
      ) {
        return { error: { message: "invalid exclusion session counts" } };
      }
    }
    this.replaceCalls += 1;
    const symbolCount = this.rows.size;
    this.production = {
      generation_id: args.p_generation_id,
      status: symbolCount === 0 ? "empty" : "available",
      symbol_count: symbolCount,
      policy_min_sessions: this.job.p_min_sessions,
      policy_excluded_count: this.exclusions.size,
      published_baseline_count: symbolCount,
      published_exclusion_count: this.exclusions.size,
    };
    this.lastFinalizeSymbolCount = symbolCount;
    this.rows.clear();
    this.exclusions.clear();
    this.job = null;
    return { error: null };
  }

  appendVolumeHistory(_args: {
    p_generation_id: string;
    p_rows: unknown[];
    p_provider_as_of: string;
  }) {
    return Promise.resolve({ error: null });
  }

  client(): StagedPublishClient {
    return {
      start: async (args) => this.start(args),
      appendRows: async (args) => this.appendRows(args),
      appendExclusions: async (args) => this.appendExclusions(args),
      appendVolumeHistory: async (args) => this.appendVolumeHistory(args),
      finalize: async (args) => this.finalize(args),
    };
  }
}

function recordingClient(store: MemoryStagingStore): StagedPublishClient & {
  rowChunkSizes: number[];
  exclusionChunkSizes: number[];
} {
  const rowChunkSizes: number[] = [];
  const exclusionChunkSizes: number[] = [];
  const inner = store.client();
  return {
    rowChunkSizes,
    exclusionChunkSizes,
    start: inner.start,
    appendRows: async (args) => {
      rowChunkSizes.push(
        serializedRequestBytes(wrapAppendRowsRequest(args.p_generation_id, args.p_rows)),
      );
      return inner.appendRows(args);
    },
    appendExclusions: async (args) => {
      exclusionChunkSizes.push(
        serializedRequestBytes(
          wrapAppendExclusionsRequest(args.p_generation_id, args.p_exclusions),
        ),
      );
      return inner.appendExclusions(args);
    },
    appendVolumeHistory: inner.appendVolumeHistory,
    finalize: inner.finalize,
  };
}

Deno.test("chunker splits large publications under the 512 KiB target", () => {
  const rows = Array.from({ length: 800 }, (_, i) => fatRow(symbolAt(i), 8));
  const result = chunkItemsByRequestBytes(
    rows,
    (chunk) => wrapAppendRowsRequest(GEN, chunk),
  );
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assert(result.chunks.length > 1, "expected multiple chunks");
  const seen = new Set<string>();
  for (const chunk of result.chunks) {
    const bytes = serializedRequestBytes(wrapAppendRowsRequest(GEN, chunk));
    assert(bytes <= STAGED_CHUNK_TARGET_BYTES, `chunk ${bytes} over target`);
    for (const row of chunk) {
      assertEquals(seen.has(row.symbol), false);
      seen.add(row.symbol);
    }
  }
  assertEquals(seen.size, rows.length);
});

Deno.test("chunker rejects a single row above the 1 MiB safety ceiling", () => {
  const row = fatRow("HUGE", 40_000);
  const result = chunkItemsByRequestBytes(
    [row],
    (chunk) => wrapAppendRowsRequest(GEN, chunk),
  );
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.code, "row_exceeds_safety_ceiling");
});

Deno.test("chunker rejects invalid maxItems instead of creating unbounded chunks", () => {
  const items = [validExclusion("AAPL")];
  const wrap = (chunk: BaselineExclusionPayload[]) =>
    wrapAppendExclusionsRequest(GEN, chunk);
  assertThrows(
    () => chunkItemsByRequestBytes(items, wrap, { maxItems: 0 }),
    Error,
    "invalid staged chunk maxItems",
  );
  assertThrows(
    () => chunkItemsByRequestBytes(items, wrap, { maxItems: 1.5 }),
    Error,
    "invalid staged chunk maxItems",
  );
});

Deno.test("exactly 2000 small exclusions stay in one chunk when bytes permit", () => {
  const exclusions = Array.from({ length: STAGED_CHUNK_MAX_ITEMS }, (_, i) =>
    validExclusion(symbolAt(30_000 + i))
  );
  const result = chunkItemsByRequestBytes(
    exclusions,
    (chunk) => wrapAppendExclusionsRequest(GEN, chunk),
    { maxItems: STAGED_CHUNK_MAX_ITEMS },
  );
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.chunks.length, 1);
  assertEquals(result.chunks[0].length, 2000);
  const bytes = serializedRequestBytes(
    wrapAppendExclusionsRequest(GEN, result.chunks[0]),
  );
  assert(bytes <= STAGED_CHUNK_TARGET_BYTES, `2000-item chunk ${bytes}`);
});

Deno.test("2001 small exclusions split on the item cap", () => {
  const exclusions = Array.from({ length: 2001 }, (_, i) =>
    validExclusion(symbolAt(40_000 + i))
  );
  const result = chunkItemsByRequestBytes(
    exclusions,
    (chunk) => wrapAppendExclusionsRequest(GEN, chunk),
    { maxItems: STAGED_CHUNK_MAX_ITEMS },
  );
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assert(result.chunks.length >= 2);
  assertEquals(result.chunks[0].length, 2000);
  assertEquals(result.chunks[1].length, 1);
  assertEquals(
    result.chunks.reduce((n, chunk) => n + chunk.length, 0),
    2001,
  );
});

Deno.test("byte limit still splits before the item cap when rows are large", () => {
  const rows = Array.from({ length: 800 }, (_, i) => fatRow(symbolAt(i), 8));
  const result = chunkItemsByRequestBytes(
    rows,
    (chunk) => wrapAppendRowsRequest(GEN, chunk),
    { maxItems: STAGED_CHUNK_MAX_ITEMS },
  );
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assert(result.chunks.length > 1);
  for (const chunk of result.chunks) {
    assert(chunk.length < STAGED_CHUNK_MAX_ITEMS);
    const bytes = serializedRequestBytes(wrapAppendRowsRequest(GEN, chunk));
    assert(bytes <= STAGED_CHUNK_TARGET_BYTES);
  }
  assertEquals(
    result.chunks.reduce((n, chunk) => n + chunk.length, 0),
    800,
  );
});

Deno.test("2671 production exclusions split into 2000 + 671, not one 502 chunk", async () => {
  const exclusions = Array.from({ length: 2671 }, (_, i) =>
    validExclusion(symbolAt(50_000 + i), {
      sessions_observed: 1 + (i % 119),
    })
  );
  const result = chunkItemsByRequestBytes(
    exclusions,
    (chunk) => wrapAppendExclusionsRequest(GEN, chunk),
    { maxItems: STAGED_CHUNK_MAX_ITEMS },
  );
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.chunks.length, 2);
  assertEquals(result.chunks[0].length, 2000);
  assertEquals(result.chunks[1].length, 671);
  const seen = new Set<string>();
  for (const chunk of result.chunks) {
    assert(chunk.length <= STAGED_CHUNK_MAX_ITEMS);
    const bytes = serializedRequestBytes(
      wrapAppendExclusionsRequest(GEN, chunk),
    );
    assert(bytes <= STAGED_CHUNK_TARGET_BYTES, `exclusion chunk ${bytes}`);
    for (const exclusion of chunk) {
      assertEquals(seen.has(exclusion.symbol), false);
      seen.add(exclusion.symbol);
    }
  }
  assertEquals(seen.size, 2671);

  const store = new MemoryStagingStore();
  const client = recordingClient(store);
  const published = await publishGenerationStaged(client, {
    generationId: GEN,
    rows: [validRow("AAPL")],
    exclusions,
    minSessions: 120,
    periodStart: START,
    periodEnd: END,
    providerAsOf: AS_OF,
  });
  assertEquals(published.ok, true);
  if (!published.ok) return;
  assertEquals(client.exclusionChunkSizes.length, 2);
  for (const bytes of client.exclusionChunkSizes) {
    assert(bytes <= STAGED_CHUNK_TARGET_BYTES);
  }
  assertEquals(store.production.policy_excluded_count, 2671);
});

Deno.test("staged publish splits requests, preserves every row/exclusion once, and stays under ceiling", async () => {
  const rows = Array.from({ length: 900 }, (_, i) => fatRow(symbolAt(i), 8));
  const exclusions = Array.from({ length: 80 }, (_, i) =>
    validExclusion(symbolAt(10_000 + i))
  );
  const store = new MemoryStagingStore();
  const client = recordingClient(store);
  const published = await publishGenerationStaged(client, {
    generationId: GEN,
    rows,
    exclusions,
    minSessions: 120,
    periodStart: START,
    periodEnd: END,
    providerAsOf: AS_OF,
  });
  assertEquals(published.ok, true);
  if (!published.ok) return;
  assert(client.rowChunkSizes.length > 1);
  assert(client.exclusionChunkSizes.length >= 1);
  for (const bytes of [...client.rowChunkSizes, ...client.exclusionChunkSizes]) {
    assert(bytes <= STAGED_CHUNK_TARGET_BYTES);
    assert(bytes <= STAGED_CHUNK_SAFETY_BYTES);
    assert(bytes < PRODUCTION_ONE_SHOT_BYTES);
  }
  assertEquals(store.replaceCalls, 1);
  assertEquals(store.production.generation_id, GEN);
  assertEquals(store.production.policy_min_sessions, 120);
  assertEquals(store.production.policy_excluded_count, 80);
  assertEquals(published.state.policy_min_sessions, 120);
  assertEquals(published.state.policy_excluded_count, 80);
});

Deno.test("retrying an identical row chunk is idempotent", () => {
  const store = new MemoryStagingStore();
  store.start({
    p_generation_id: GEN,
    p_period_start: START,
    p_period_end: END,
    p_provider_as_of: AS_OF,
    p_expected_baseline_count: 1,
    p_expected_exclusion_count: 0,
    p_min_sessions: 120,
  });
  const chunk = [validRow("AAPL")];
  assertEquals(store.appendRows({ p_generation_id: GEN, p_rows: chunk }).error, null);
  assertEquals(store.appendRows({ p_generation_id: GEN, p_rows: chunk }).error, null);
  assertEquals(store.rows.size, 1);
  assertEquals(store.rows.get("AAPL")?.high_52w, 12);
  assertEquals(store.rowAppendCalls, 2);
});

Deno.test("retrying an identical exclusion chunk is idempotent", () => {
  const store = new MemoryStagingStore();
  store.start({
    p_generation_id: GEN,
    p_period_start: START,
    p_period_end: END,
    p_provider_as_of: AS_OF,
    p_expected_baseline_count: 0,
    p_expected_exclusion_count: 1,
    p_min_sessions: 120,
  });
  const chunk = [validExclusion("IPO")];
  assertEquals(
    store.appendExclusions({ p_generation_id: GEN, p_exclusions: chunk }).error,
    null,
  );
  assertEquals(
    store.appendExclusions({ p_generation_id: GEN, p_exclusions: chunk }).error,
    null,
  );
  assertEquals(store.exclusions.size, 1);
  assertEquals(store.exclusions.get("IPO")?.sessions_observed, 40);
});

Deno.test("altered baseline duplicate for the same symbol fails closed", () => {
  const store = new MemoryStagingStore();
  store.start({
    p_generation_id: GEN,
    p_period_start: START,
    p_period_end: END,
    p_provider_as_of: AS_OF,
    p_expected_baseline_count: 1,
    p_expected_exclusion_count: 0,
    p_min_sessions: 120,
  });
  const original = validRow("AAPL");
  assertEquals(
    store.appendRows({ p_generation_id: GEN, p_rows: [original] }).error,
    null,
  );
  const altered = validRow("AAPL", {
    high_52w: 99,
    high_candidates: [{ d: "2026-08-11", v: 99 }],
  });
  const result = store.appendRows({ p_generation_id: GEN, p_rows: [altered] });
  assertEquals(result.error?.message, "conflicting staged baseline row");
  assertEquals(store.rows.size, 1);
  assertEquals(store.rows.get("AAPL")?.high_52w, 12);
  assertEquals(store.production.generation_id, PRIOR_GEN);
});

Deno.test("altered exclusion duplicate for the same symbol fails closed", () => {
  const store = new MemoryStagingStore();
  store.start({
    p_generation_id: GEN,
    p_period_start: START,
    p_period_end: END,
    p_provider_as_of: AS_OF,
    p_expected_baseline_count: 0,
    p_expected_exclusion_count: 1,
    p_min_sessions: 120,
  });
  const original = validExclusion("IPO");
  assertEquals(
    store.appendExclusions({ p_generation_id: GEN, p_exclusions: [original] })
      .error,
    null,
  );
  const result = store.appendExclusions({
    p_generation_id: GEN,
    p_exclusions: [validExclusion("IPO", { sessions_observed: 10 })],
  });
  assertEquals(result.error?.message, "conflicting staged exclusion");
  assertEquals(store.exclusions.size, 1);
  assertEquals(store.exclusions.get("IPO")?.sessions_observed, 40);
  assertEquals(store.production.generation_id, PRIOR_GEN);
});

Deno.test("failed middle chunk never flips the production generation", async () => {
  const rows = Array.from({ length: 900 }, (_, i) => fatRow(symbolAt(i), 8));
  const store = new MemoryStagingStore();
  let rowCalls = 0;
  const client: StagedPublishClient = {
    start: async (args) => store.start(args),
    appendRows: async (args) => {
      rowCalls += 1;
      if (rowCalls === 2) return { error: { message: "persist_failed" } };
      return store.appendRows(args);
    },
    appendExclusions: async (args) => store.appendExclusions(args),
    appendVolumeHistory: async (args) => store.appendVolumeHistory(args),
    finalize: async (args) => store.finalize(args),
  };
  const published = await publishGenerationStaged(client, {
    generationId: GEN,
    rows,
    exclusions: [],
    minSessions: 120,
    periodStart: START,
    periodEnd: END,
    providerAsOf: AS_OF,
  });
  assertEquals(published.ok, false);
  if (published.ok) return;
  assertEquals(published.code, "persist_failed");
  assertEquals(store.finalizeCalls, 0);
  assertEquals(store.replaceCalls, 0);
  assertEquals(store.production.generation_id, PRIOR_GEN);
  assertEquals(store.production.policy_min_sessions, null);
});

Deno.test("failed finalizer never flips the production generation", async () => {
  const store = new MemoryStagingStore();
  const inner = store.client();
  const client: StagedPublishClient = {
    start: inner.start,
    appendRows: inner.appendRows,
    appendExclusions: inner.appendExclusions,
    appendVolumeHistory: inner.appendVolumeHistory,
    finalize: async () => ({ error: { message: "persist_failed" } }),
  };
  const published = await publishGenerationStaged(client, {
    generationId: GEN,
    rows: [validRow("AAPL")],
    exclusions: [validExclusion("IPO")],
    minSessions: 120,
    periodStart: START,
    periodEnd: END,
    providerAsOf: AS_OF,
  });
  assertEquals(published.ok, false);
  if (published.ok) return;
  assertEquals(published.code, "persist_failed");
  assertEquals(store.replaceCalls, 0);
  assertEquals(store.production.generation_id, PRIOR_GEN);
  assertEquals(store.rows.size, 1);
  assertEquals(store.exclusions.size, 1);
});

Deno.test("wrong generation fails closed without flipping production", () => {
  const store = new MemoryStagingStore();
  store.start({
    p_generation_id: GEN,
    p_period_start: START,
    p_period_end: END,
    p_provider_as_of: AS_OF,
    p_expected_baseline_count: 1,
    p_expected_exclusion_count: 0,
    p_min_sessions: 120,
  });
  store.appendRows({ p_generation_id: GEN, p_rows: [validRow("AAPL")] });
  const result = store.finalize({ p_generation_id: OTHER_GEN });
  assertEquals(result.error?.message, "wrong generation");
  assertEquals(store.replaceCalls, 0);
  assertEquals(store.production.generation_id, PRIOR_GEN);
});

Deno.test("baseline/exclusion overlap fails closed", () => {
  const store = new MemoryStagingStore();
  store.start({
    p_generation_id: GEN,
    p_period_start: START,
    p_period_end: END,
    p_provider_as_of: AS_OF,
    p_expected_baseline_count: 1,
    p_expected_exclusion_count: 1,
    p_min_sessions: 120,
  });
  store.appendRows({ p_generation_id: GEN, p_rows: [validRow("AAPL")] });
  store.appendExclusions({
    p_generation_id: GEN,
    p_exclusions: [validExclusion("AAPL")],
  });
  const result = store.finalize({ p_generation_id: GEN });
  assertEquals(result.error?.message, "exclusion symbol overlaps baseline");
  assertEquals(store.replaceCalls, 0);
  assertEquals(store.production.generation_id, PRIOR_GEN);
});

Deno.test("baseline row below min sessions fails closed", () => {
  const store = new MemoryStagingStore();
  store.start({
    p_generation_id: GEN,
    p_period_start: START,
    p_period_end: END,
    p_provider_as_of: AS_OF,
    p_expected_baseline_count: 1,
    p_expected_exclusion_count: 0,
    p_min_sessions: 120,
  });
  store.appendRows({
    p_generation_id: GEN,
    p_rows: [validRow("AAPL", { sessions_observed: 119 })],
  });
  const result = store.finalize({ p_generation_id: GEN });
  assertEquals(result.error?.message, "invalid baseline session counts");
  assertEquals(store.replaceCalls, 0);
  assertEquals(store.production.generation_id, PRIOR_GEN);
});

Deno.test("exclusion at or above min sessions fails closed", () => {
  const store = new MemoryStagingStore();
  store.start({
    p_generation_id: GEN,
    p_period_start: START,
    p_period_end: END,
    p_provider_as_of: AS_OF,
    p_expected_baseline_count: 1,
    p_expected_exclusion_count: 1,
    p_min_sessions: 120,
  });
  store.appendRows({ p_generation_id: GEN, p_rows: [validRow("AAPL")] });
  store.appendExclusions({
    p_generation_id: GEN,
    p_exclusions: [validExclusion("IPO", { sessions_observed: 120 })],
  });
  const result = store.finalize({ p_generation_id: GEN });
  assertEquals(result.error?.message, "invalid exclusion session counts");
  assertEquals(store.replaceCalls, 0);
  assertEquals(store.production.generation_id, PRIOR_GEN);
});

Deno.test("expected/actual count mismatch fails closed", () => {
  const store = new MemoryStagingStore();
  store.start({
    p_generation_id: GEN,
    p_period_start: START,
    p_period_end: END,
    p_provider_as_of: AS_OF,
    p_expected_baseline_count: 2,
    p_expected_exclusion_count: 0,
    p_min_sessions: 120,
  });
  store.appendRows({ p_generation_id: GEN, p_rows: [validRow("AAPL")] });
  const result = store.finalize({ p_generation_id: GEN });
  assertEquals(result.error?.message, "expected/actual baseline count mismatch");
  assertEquals(store.replaceCalls, 0);
  assertEquals(store.production.generation_id, PRIOR_GEN);
});

Deno.test("successful finalizer sets policy_min_sessions 120 and exact excluded count", async () => {
  const store = new MemoryStagingStore();
  const published = await publishGenerationStaged(store.client(), {
    generationId: GEN,
    rows: [validRow("AAPL"), validRow("MSFT")],
    exclusions: [validExclusion("IPO"), validExclusion("NEW")],
    minSessions: 120,
    periodStart: START,
    periodEnd: END,
    providerAsOf: AS_OF,
  });
  assertEquals(published.ok, true);
  if (!published.ok) return;
  assertEquals(published.state.policy_min_sessions, 120);
  assertEquals(published.state.policy_excluded_count, 2);
  assertEquals(store.production.policy_min_sessions, 120);
  assertEquals(store.production.policy_excluded_count, 2);
  assertEquals(store.job, null);
  assertEquals(store.rows.size, 0);
});

Deno.test("finalize retry after cleanup is idempotent and does not republish", () => {
  const store = new MemoryStagingStore();
  store.start({
    p_generation_id: GEN,
    p_period_start: START,
    p_period_end: END,
    p_provider_as_of: AS_OF,
    p_expected_baseline_count: 2,
    p_expected_exclusion_count: 1,
    p_min_sessions: 120,
  });
  store.appendRows({
    p_generation_id: GEN,
    p_rows: [validRow("AAPL"), validRow("MSFT")],
  });
  store.appendExclusions({
    p_generation_id: GEN,
    p_exclusions: [validExclusion("IPO")],
  });
  const first = store.finalize({ p_generation_id: GEN });
  assertEquals(first.error, null);
  assertEquals(store.replaceCalls, 1);
  assertEquals(store.lastFinalizeSymbolCount, 2);
  assertEquals(store.job, null);
  assertEquals(store.rows.size, 0);
  assertEquals(store.exclusions.size, 0);

  const retry = store.finalize({ p_generation_id: GEN });
  assertEquals(retry.error, null);
  assertEquals(store.replaceCalls, 1);
  assertEquals(store.lastFinalizeSymbolCount, 2);
  assertEquals(store.job, null);
  assertEquals(store.rows.size, 0);
  assertEquals(store.exclusions.size, 0);
  assertEquals(store.production.generation_id, GEN);
  assertEquals(store.production.symbol_count, 2);
});

Deno.test("old finalize retry does not delete a newer staging generation", () => {
  const store = new MemoryStagingStore();
  store.start({
    p_generation_id: GEN,
    p_period_start: START,
    p_period_end: END,
    p_provider_as_of: AS_OF,
    p_expected_baseline_count: 1,
    p_expected_exclusion_count: 0,
    p_min_sessions: 120,
  });
  store.appendRows({ p_generation_id: GEN, p_rows: [validRow("AAPL")] });
  assertEquals(store.finalize({ p_generation_id: GEN }).error, null);
  assertEquals(store.replaceCalls, 1);

  store.start({
    p_generation_id: OTHER_GEN,
    p_period_start: START,
    p_period_end: END,
    p_provider_as_of: AS_OF,
    p_expected_baseline_count: 1,
    p_expected_exclusion_count: 0,
    p_min_sessions: 120,
  });
  store.appendRows({
    p_generation_id: OTHER_GEN,
    p_rows: [validRow("MSFT")],
  });
  const retry = store.finalize({ p_generation_id: GEN });
  assertEquals(retry.error, null);
  assertEquals(store.replaceCalls, 1);
  assertEquals(store.job?.p_generation_id, OTHER_GEN);
  assertEquals(store.rows.has("MSFT"), true);
  assertEquals(store.production.generation_id, GEN);
});

Deno.test("old finalize retry fails once another generation is current", () => {
  const store = new MemoryStagingStore();
  store.start({
    p_generation_id: GEN,
    p_period_start: START,
    p_period_end: END,
    p_provider_as_of: AS_OF,
    p_expected_baseline_count: 1,
    p_expected_exclusion_count: 0,
    p_min_sessions: 120,
  });
  store.appendRows({ p_generation_id: GEN, p_rows: [validRow("AAPL")] });
  assertEquals(store.finalize({ p_generation_id: GEN }).error, null);

  store.start({
    p_generation_id: OTHER_GEN,
    p_period_start: START,
    p_period_end: END,
    p_provider_as_of: AS_OF,
    p_expected_baseline_count: 1,
    p_expected_exclusion_count: 0,
    p_min_sessions: 120,
  });
  store.appendRows({
    p_generation_id: OTHER_GEN,
    p_rows: [validRow("MSFT")],
  });
  assertEquals(store.finalize({ p_generation_id: OTHER_GEN }).error, null);
  assertEquals(store.production.generation_id, OTHER_GEN);
  assertEquals(store.replaceCalls, 2);

  const retry = store.finalize({ p_generation_id: GEN });
  assertEquals(retry.error?.message, "wrong generation");
  assertEquals(store.replaceCalls, 2);
  assertEquals(store.production.generation_id, OTHER_GEN);
});

Deno.test("missing job plus unrelated current generation fails closed", () => {
  const store = new MemoryStagingStore();
  const result = store.finalize({ p_generation_id: GEN });
  assertEquals(result.error?.message, "wrong generation");
  assertEquals(store.replaceCalls, 0);
  assertEquals(store.production.generation_id, PRIOR_GEN);
  assertEquals(store.job, null);
});

Deno.test("current generation with NULL policy evidence is not an idempotent success", () => {
  const store = new MemoryStagingStore();
  store.production = {
    generation_id: GEN,
    status: "available",
    symbol_count: 1,
    policy_min_sessions: null,
    policy_excluded_count: null,
    published_baseline_count: 1,
    published_exclusion_count: 0,
  };
  const result = store.finalize({ p_generation_id: GEN });
  assertEquals(result.error?.message, "wrong generation");
  assertEquals(store.replaceCalls, 0);
  assertEquals(store.job, null);
});

Deno.test("payload size proof: staged requests stay far below the 14.8 MB one-shot", () => {
  const baselineCount = 11_950;
  const exclusionCount = 420;
  const rows = Array.from({ length: baselineCount }, (_, i) => fatRow(symbolAt(i), 8));
  const exclusions = Array.from({ length: exclusionCount }, (_, i) =>
    validExclusion(symbolAt(20_000 + i))
  );
  const oneShot = serializedRequestBytes({
    action: "replace_52w_baseline_with_exclusions",
    p_generation_id: GEN,
    p_rows: rows,
    p_period_start: START,
    p_period_end: END,
    p_provider_as_of: AS_OF,
    p_status: "available",
    p_exclusions: exclusions,
    p_min_sessions: 120,
    request_id: "00000000-0000-0000-0000-000000000000",
  });
  const rowChunks = chunkItemsByRequestBytes(
    rows,
    (chunk) => wrapAppendRowsRequest(GEN, chunk),
  );
  const exclusionChunks = chunkItemsByRequestBytes(
    exclusions,
    (chunk) => wrapAppendExclusionsRequest(GEN, chunk),
  );
  assertEquals(rowChunks.ok, true);
  assertEquals(exclusionChunks.ok, true);
  if (!rowChunks.ok || !exclusionChunks.ok) return;

  const rowBytes = rowChunks.chunks.map((chunk) =>
    serializedRequestBytes(wrapAppendRowsRequest(GEN, chunk))
  );
  const exclusionBytes = exclusionChunks.chunks.map((chunk) =>
    serializedRequestBytes(wrapAppendExclusionsRequest(GEN, chunk))
  );
  const largest = Math.max(...rowBytes, ...exclusionBytes);
  const startBytes = serializedRequestBytes({
    action: "start_52w_baseline_publish",
    p_generation_id: GEN,
    p_period_start: START,
    p_period_end: END,
    p_provider_as_of: AS_OF,
    p_expected_baseline_count: baselineCount,
    p_expected_exclusion_count: exclusionCount,
    p_min_sessions: 120,
    request_id: "00000000-0000-0000-0000-000000000000",
  });
  const finalizeBytes = serializedRequestBytes({
    action: "finalize_52w_baseline_publish",
    p_generation_id: GEN,
    request_id: "00000000-0000-0000-0000-000000000000",
  });

  assert(oneShot > 8_000_000, `fixture one-shot too small: ${oneShot}`);
  assert(largest <= STAGED_CHUNK_TARGET_BYTES, `largest chunk ${largest}`);
  assert(largest <= STAGED_CHUNK_SAFETY_BYTES);
  assert(startBytes < 2_048);
  assert(finalizeBytes < 512);
  assertEquals(
    rowChunks.chunks.reduce((n, chunk) => n + chunk.length, 0),
    baselineCount,
  );
  assertEquals(
    exclusionChunks.chunks.reduce((n, chunk) => n + chunk.length, 0),
    exclusionCount,
  );
  console.log(JSON.stringify({
    msg: "baseline_chunked_payload_proof",
    old_one_shot_serialized_bytes: oneShot,
    production_failed_request_bytes: PRODUCTION_ONE_SHOT_BYTES,
    largest_new_chunk_bytes: largest,
    baseline_chunk_count: rowChunks.chunks.length,
    exclusion_chunk_count: exclusionChunks.chunks.length,
    start_bytes: startBytes,
    finalize_bytes: finalizeBytes,
    total_baseline_rows: baselineCount,
    total_exclusions: exclusionCount,
    total_rows_preserved: baselineCount + exclusionCount,
  }));
});

Deno.test("production-shape 11961/2671 honors item cap and 512 KiB target", () => {
  const baselineCount = 11_961;
  const exclusionCount = 2_671;
  const rows = Array.from({ length: baselineCount }, (_, i) => fatRow(symbolAt(i), 8));
  const exclusions = Array.from({ length: exclusionCount }, (_, i) =>
    validExclusion(symbolAt(20_000 + i), {
      sessions_observed: 1 + (i % 119),
    })
  );
  const rowChunks = chunkItemsByRequestBytes(
    rows,
    (chunk) => wrapAppendRowsRequest(GEN, chunk),
    { maxItems: STAGED_CHUNK_MAX_ITEMS },
  );
  const exclusionChunks = chunkItemsByRequestBytes(
    exclusions,
    (chunk) => wrapAppendExclusionsRequest(GEN, chunk),
    { maxItems: STAGED_CHUNK_MAX_ITEMS },
  );
  assertEquals(rowChunks.ok, true);
  assertEquals(exclusionChunks.ok, true);
  if (!rowChunks.ok || !exclusionChunks.ok) return;

  assertEquals(exclusionChunks.chunks.length, 2);
  assertEquals(exclusionChunks.chunks[0].length, 2000);
  assertEquals(exclusionChunks.chunks[1].length, 671);

  const rowItemCounts = rowChunks.chunks.map((chunk) => chunk.length);
  const rowBytes = rowChunks.chunks.map((chunk) =>
    serializedRequestBytes(wrapAppendRowsRequest(GEN, chunk))
  );
  const exclusionItemCounts = exclusionChunks.chunks.map((chunk) => chunk.length);
  const exclusionBytes = exclusionChunks.chunks.map((chunk) =>
    serializedRequestBytes(wrapAppendExclusionsRequest(GEN, chunk))
  );

  for (const count of [...rowItemCounts, ...exclusionItemCounts]) {
    assert(count <= STAGED_CHUNK_MAX_ITEMS);
  }
  for (const bytes of [...rowBytes, ...exclusionBytes]) {
    assert(bytes <= STAGED_CHUNK_TARGET_BYTES);
    assert(bytes <= STAGED_CHUNK_SAFETY_BYTES);
  }
  assertEquals(
    rowChunks.chunks.reduce((n, chunk) => n + chunk.length, 0),
    baselineCount,
  );
  assertEquals(
    exclusionChunks.chunks.reduce((n, chunk) => n + chunk.length, 0),
    exclusionCount,
  );

  console.log(JSON.stringify({
    msg: "production_shape_item_cap_proof",
    baseline_chunk_count: rowChunks.chunks.length,
    largest_baseline_item_count: Math.max(...rowItemCounts),
    largest_baseline_payload_bytes: Math.max(...rowBytes),
    exclusion_chunk_count: exclusionChunks.chunks.length,
    exclusion_item_counts: exclusionItemCounts,
    largest_exclusion_payload_bytes: Math.max(...exclusionBytes),
  }));
});
