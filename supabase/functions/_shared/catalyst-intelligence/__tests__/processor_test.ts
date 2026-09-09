import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DEFAULT_LIMIT } from "../activation.ts";
import { V1A_MANDATORY_FLAGS, failClosedFlags, readCatalystFlags } from "../flags.ts";
import {
  executeProcessor,
  processCatalystIntelligenceBatch,
  type ProcessorStore,
} from "../processor.ts";
import { compareCatalystEventRows, type CatalystEventRow } from "../select.ts";
import { toIntelligenceRow } from "../persist.ts";
import { RULES_VERSION } from "../types.ts";
import { processorAlertDedupeKey, processorAlertType } from "../alerts.ts";
import {
  amdLongTermCommentary,
  irenErcotFactual,
  muVsSandiskCommentary,
  nowMs,
  occScheduledEarnings,
  orclPredictionCommentary,
} from "./fixtures.ts";
import type { NormalizedCatalystInput } from "../types.ts";

function rowFromInput(input: NormalizedCatalystInput, id?: string): CatalystEventRow {
  return {
    id: id ?? input.id ?? "missing",
    dedupe_key: input.dedupe_key,
    symbol: input.symbol,
    company_name: input.company_name ?? null,
    event_type: input.event_type,
    verification_state: input.verification_state ?? "provider_reported",
    event_date: input.event_date,
    event_time: input.event_time ?? null,
    time_of_day: input.time_of_day ?? null,
    title: input.title,
    description: input.description ?? null,
    source_name: input.source_name,
    source_url: input.source_url ?? null,
    provider: input.provider,
    provider_article_id: input.provider_article_id ?? null,
    related_symbols: input.related_symbols ?? [],
    facts: input.facts ?? {},
    published_at: input.published_at ?? null,
    created_at: input.created_at ?? null,
  };
}

function memoryStore(seed: CatalystEventRow[], opts?: {
  existingIntel?: Set<string>;
  existingAlerts?: Set<string>;
}): ProcessorStore & { writes: unknown[]; catalystEventsWrites: number } {
  const writes: unknown[] = [];
  const intel = new Set(opts?.existingIntel ?? []);
  const alerts = new Set(opts?.existingAlerts ?? []);
  return {
    writes,
    catalystEventsWrites: 0,
    async loadCatalystEvents() {
      return seed;
    },
    async findIntelligenceIdentity(sourceEventId, rulesVersion) {
      return intel.has(`${sourceEventId}:${rulesVersion}`);
    },
    async insertIntelligence(row) {
      writes.push({ table: "catalyst_intelligence", row });
      const key = `${row.source_event_id}:${row.rules_version}`;
      if (intel.has(key)) return { ok: false, duplicate: true };
      intel.add(key);
      return { ok: true, id: `intel-db-${writes.length}` };
    },
    async findAlertDedupe(dedupeKey) {
      return alerts.has(dedupeKey);
    },
    async insertAlert(row, intelligenceId) {
      writes.push({ table: "alert_events", row, intelligenceId });
      if (alerts.has(row.dedupe_key)) return { ok: false, duplicate: true };
      alerts.add(row.dedupe_key);
      return { ok: true };
    },
  };
}

const WRITE_FLAGS = readCatalystFlags({
  CATALYST_INTELLIGENCE_ENABLED: "true",
  CATALYST_INTELLIGENCE_WRITE_ENABLED: "true",
  CATALYST_ALERT_GENERATION_ENABLED: "true",
  ALERT_DELIVERY_ENABLED: "false",
});

Deno.test("dry_run performs zero writes including catalyst_events", async () => {
  const store = memoryStore([rowFromInput(occScheduledEarnings())]);
  const executed = await executeProcessor({
    mode: "dry_run",
    flags: WRITE_FLAGS,
    selection: {
      limit: DEFAULT_LIMIT,
      catalyst_event_id: null,
      since: null,
      symbols: null,
      provider: null,
    },
    nowMs: nowMs(),
    store,
  });
  assertEquals(executed.ok, true);
  if (!executed.ok) return;
  assertEquals(executed.result.writesAttempted, 0);
  assertEquals(store.writes.length, 0);
  assertEquals(executed.result.telemetry.catalyst_events_writes, 0);
  assertEquals(executed.result.telemetry.mode, "dry_run");
  assertEquals(executed.result.telemetry.rules_version, RULES_VERSION);
  assert(executed.result.telemetry.events_scanned >= 1);
});

Deno.test("write persists intelligence then optional alerts and never catalyst_events", async () => {
  const store = memoryStore([rowFromInput(occScheduledEarnings())]);
  const executed = await executeProcessor({
    mode: "write",
    flags: WRITE_FLAGS,
    selection: {
      limit: 10,
      catalyst_event_id: null,
      since: null,
      symbols: ["OCC"],
      provider: "earnings_calendar",
    },
    nowMs: nowMs(),
    store,
  });
  assertEquals(executed.ok, true);
  if (!executed.ok) return;
  assert(executed.result.writesAttempted >= 1);
  assertEquals(store.writes.some((w) => (w as { table: string }).table === "catalyst_intelligence"), true);
  assertEquals(store.writes.some((w) => (w as { table: string }).table === "catalyst_events"), false);
  assertEquals(executed.result.telemetry.catalyst_events_writes, 0);
});

Deno.test("write without intelligence flags performs zero writes", async () => {
  const store = memoryStore([rowFromInput(occScheduledEarnings())]);
  const executed = await executeProcessor({
    mode: "write",
    flags: failClosedFlags(),
    selection: {
      limit: 10,
      catalyst_event_id: null,
      since: null,
      symbols: null,
      provider: null,
    },
    nowMs: nowMs(),
    store,
  });
  assertEquals(executed.ok, true);
  if (!executed.ok) return;
  assertEquals(executed.result.writesAttempted, 0);
  assertEquals(store.writes.length, 0);
});

Deno.test("idempotent intelligence identity is event id plus rules version", () => {
  const row = rowFromInput(occScheduledEarnings());
  const first = processCatalystIntelligenceBatch([row], {
    mode: "dry_run",
    flags: V1A_MANDATORY_FLAGS,
    selection: {
      limit: 10,
      catalyst_event_id: null,
      since: null,
      symbols: null,
      provider: null,
    },
    nowMs: nowMs(),
    store: memoryStore([row]),
    existingIntelligence: new Set(),
  });
  assertEquals(first.proposed[0].intelligence, "would_create");
  const mapped = toIntelligenceRow(first.proposed[0].record!);
  assertEquals(mapped.source_event_id, row.id);
  assertEquals(mapped.rules_version, RULES_VERSION);

  const second = processCatalystIntelligenceBatch([row], {
    mode: "dry_run",
    flags: V1A_MANDATORY_FLAGS,
    selection: {
      limit: 10,
      catalyst_event_id: null,
      since: null,
      symbols: null,
      provider: null,
    },
    nowMs: nowMs(),
    store: memoryStore([row]),
    existingIntelligence: new Set([`${row.id}:${RULES_VERSION}`]),
  });
  assertEquals(second.proposed[0].intelligence, "duplicate");
  assertEquals(second.telemetry.duplicate_intelligence, 1);
  assertEquals(second.persistPlan.length, 0);
});

Deno.test("duplicate alerts use processor dedupe key", () => {
  const row = rowFromInput(occScheduledEarnings());
  const first = processCatalystIntelligenceBatch([row], {
    mode: "dry_run",
    flags: V1A_MANDATORY_FLAGS,
    selection: {
      limit: 10,
      catalyst_event_id: null,
      since: null,
      symbols: null,
      provider: null,
    },
    nowMs: nowMs(),
    store: memoryStore([row]),
  });
  const record = first.proposed[0].record;
  assertExists(record);
  const key = processorAlertDedupeKey(
    row.id,
    RULES_VERSION,
    processorAlertType(record.scores.catalyst_score),
  );
  const second = processCatalystIntelligenceBatch([row], {
    mode: "dry_run",
    flags: V1A_MANDATORY_FLAGS,
    selection: {
      limit: 10,
      catalyst_event_id: null,
      since: null,
      symbols: null,
      provider: null,
    },
    nowMs: nowMs(),
    store: memoryStore([row]),
    existingAlerts: new Set([key]),
  });
  assertEquals(second.proposed[0].alert === "duplicate" || second.proposed[0].alert === "suppressed", true);
});

Deno.test("per-event failures isolate and continue the batch", () => {
  const good = rowFromInput(occScheduledEarnings());
  const bad: CatalystEventRow = {
    ...good,
    id: "evt-bad",
    dedupe_key: "",
    title: "",
  };
  const out = processCatalystIntelligenceBatch([bad, good], {
    mode: "dry_run",
    flags: V1A_MANDATORY_FLAGS,
    selection: {
      limit: 10,
      catalyst_event_id: null,
      since: null,
      symbols: null,
      provider: null,
    },
    nowMs: nowMs(),
    store: memoryStore([bad, good]),
  });
  assertEquals(out.telemetry.errors >= 1, true);
  assertEquals(out.telemetry.events_processed, 1);
  assertEquals(out.proposed.some((p) => p.catalyst_event_id === good.id && p.record !== null), true);
});

Deno.test("deterministic ordering is recency then id", () => {
  const older = rowFromInput(orclPredictionCommentary(), "aaa");
  older.published_at = "2026-09-09T09:00:00.000Z";
  const newer = rowFromInput(amdLongTermCommentary(), "zzz");
  newer.published_at = "2026-09-09T11:00:00.000Z";
  const sameTimeA = rowFromInput(muVsSandiskCommentary(), "a-id");
  sameTimeA.published_at = "2026-09-09T10:00:00.000Z";
  const sameTimeB = rowFromInput(irenErcotFactual(), "b-id");
  sameTimeB.published_at = "2026-09-09T10:00:00.000Z";
  const sorted = [older, newer, sameTimeB, sameTimeA].sort(compareCatalystEventRows);
  assertEquals(sorted[0].id, "zzz");
  const same = sorted.filter((r) => r.published_at === "2026-09-09T10:00:00.000Z");
  assertEquals(same[0].id < same[1].id, true);
});

Deno.test("unknown provider remains conservative in processor telemetry", () => {
  const row = rowFromInput({
    ...orclPredictionCommentary(),
    provider: "mystery_wire",
    title: "Company files 8-K",
    id: "evt-unknown",
    dedupe_key: "wire:1:ORCL",
  });
  const out = processCatalystIntelligenceBatch([row], {
    mode: "dry_run",
    flags: V1A_MANDATORY_FLAGS,
    selection: {
      limit: 10,
      catalyst_event_id: null,
      since: null,
      symbols: null,
      provider: null,
    },
    nowMs: nowMs(),
    store: memoryStore([row]),
  });
  assertEquals(out.telemetry.unknown_providers, 1);
});

Deno.test("alert generation disabled suppresses alerts in dry-run telemetry", () => {
  const row = rowFromInput(occScheduledEarnings());
  const flags = readCatalystFlags({
    CATALYST_INTELLIGENCE_ENABLED: "true",
    CATALYST_ALERT_GENERATION_ENABLED: "false",
  });
  const out = processCatalystIntelligenceBatch([row], {
    mode: "dry_run",
    flags,
    selection: {
      limit: 10,
      catalyst_event_id: null,
      since: null,
      symbols: null,
      provider: null,
    },
    nowMs: nowMs(),
    store: memoryStore([row]),
  });
  assertEquals(out.proposed[0].alert, "suppressed");
  assertEquals(out.telemetry.alerts_suppressed, 1);
  assertEquals(out.telemetry.alerts_qualified, 0);
});
