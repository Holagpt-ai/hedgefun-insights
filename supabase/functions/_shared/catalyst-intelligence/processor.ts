// Bounded shadow processor. Reads catalyst_events. Never mutates them.
// Dry-run: zero writes. Write: intelligence then optional silent alerts.

import { adaptCatalystEventRow } from "./adapt.ts";
import {
  processorAlertDedupeKey,
  processorAlertType,
  buildAlertEvent,
} from "./alerts.ts";
import type { CatalystFlags } from "./flags.ts";
import { isKnownProvider } from "./providers.ts";
import { toAlertEventRow, toIntelligenceRow } from "./persist.ts";
import { evaluateCatalystIntelligence } from "./pipeline.ts";
import { qualifyForAlert } from "./qualify.ts";
import { createNotificationRouter } from "./router.ts";
import type { CatalystEventRow } from "./select.ts";
import { applySelection } from "./select.ts";
import type { IntelligenceSelection } from "./activation.ts";
import {
  emptyTelemetry,
  increment,
  recordScore,
  type ProcessorTelemetry,
} from "./telemetry.ts";
import { RULES_VERSION } from "./types.ts";
import type { AlertEvent, CatalystIntelligenceRecord } from "./types.ts";

export type AlertDryRunStatus = "would_create" | "duplicate" | "suppressed";
export type IntelligenceDryRunStatus = "would_create" | "duplicate" | "skipped";

export interface ProcessorStore {
  loadCatalystEvents(selection: IntelligenceSelection): Promise<CatalystEventRow[] | null>;
  findIntelligenceIdentity(sourceEventId: string, rulesVersion: string): Promise<boolean | null>;
  insertIntelligence(row: ReturnType<typeof toIntelligenceRow>): Promise<
    { ok: true; id: string } | { ok: false; duplicate: boolean }
  >;
  findAlertDedupe(dedupeKey: string): Promise<boolean | null>;
  insertAlert(
    row: ReturnType<typeof toAlertEventRow>,
    intelligenceId: string,
  ): Promise<{ ok: true } | { ok: false; duplicate: boolean }>;
}

export interface ProcessBatchResult {
  telemetry: ProcessorTelemetry;
  writesAttempted: number;
}

function intelligenceKey(sourceEventId: string, rulesVersion: string): string {
  return `${sourceEventId}:${rulesVersion}`;
}

export function processCatalystIntelligenceBatch(
  rows: CatalystEventRow[],
  deps: {
    mode: "dry_run" | "write";
    flags: CatalystFlags;
    selection: IntelligenceSelection;
    nowMs: number;
    store: ProcessorStore;
    existingIntelligence?: Set<string>;
    existingAlerts?: Set<string>;
  },
): {
  telemetry: ProcessorTelemetry;
  proposed: Array<{
    catalyst_event_id: string;
    intelligence: IntelligenceDryRunStatus;
    alert: AlertDryRunStatus;
    record: CatalystIntelligenceRecord | null;
  }>;
  persistPlan: Array<{
    record: CatalystIntelligenceRecord;
    alert: AlertEvent | null;
  }>;
} {
  const startedAt = new Date(deps.nowMs).toISOString();
  const telemetry = emptyTelemetry(deps.mode, RULES_VERSION, startedAt);
  const selected = applySelection(rows, deps.selection);
  telemetry.events_scanned = selected.length;

  const proposed: Array<{
    catalyst_event_id: string;
    intelligence: IntelligenceDryRunStatus;
    alert: AlertDryRunStatus;
    record: CatalystIntelligenceRecord | null;
  }> = [];
  const persistPlan: Array<{
    record: CatalystIntelligenceRecord;
    alert: AlertEvent | null;
  }> = [];

  const seenIntel = new Set(deps.existingIntelligence ?? []);
  const seenAlerts = new Set(deps.existingAlerts ?? []);
  const router = createNotificationRouter(deps.flags);

  for (const row of selected) {
    try {
      const adapted = adaptCatalystEventRow(row);
      if (!adapted) {
        telemetry.events_skipped += 1;
        telemetry.errors += 1;
        proposed.push({
          catalyst_event_id: row.id,
          intelligence: "skipped",
          alert: "suppressed",
          record: null,
        });
        continue;
      }

      increment(telemetry.provider_counts, adapted.provider);
      if (!isKnownProvider(adapted.provider)) telemetry.unknown_providers += 1;

      const record = evaluateCatalystIntelligence(adapted, deps.nowMs);
      if (!record || !record.source_event_id) {
        telemetry.events_skipped += 1;
        proposed.push({
          catalyst_event_id: row.id,
          intelligence: "skipped",
          alert: "suppressed",
          record: null,
        });
        continue;
      }

      increment(telemetry.class_counts, record.classification);
      recordScore(telemetry, record.scores.catalyst_score);
      telemetry.events_processed += 1;

      const ident = intelligenceKey(record.source_event_id, record.rules_version);
      let intelStatus: IntelligenceDryRunStatus = "would_create";
      if (seenIntel.has(ident)) {
        intelStatus = "duplicate";
        telemetry.duplicate_intelligence += 1;
      }

      const qualification = qualifyForAlert(record, deps.flags);
      let alertStatus: AlertDryRunStatus = "suppressed";
      let alertEvent: AlertEvent | null = null;
      if (!qualification.qualified) {
        telemetry.alerts_suppressed += 1;
      } else {
        telemetry.alerts_qualified += 1;
        const alertType = processorAlertType(record.scores.catalyst_score);
        const key = processorAlertDedupeKey(
          record.source_event_id,
          record.rules_version,
          alertType,
        );
        const built = {
          ...buildAlertEvent(record, record.created_at),
          dedupeKey: key,
        };
        const routed = router.route(built);
        alertEvent = {
          ...built,
          deliveryStatus: "suppressed",
          deliverySuppressedReason: routed.reason,
        };
        if (seenAlerts.has(key)) {
          alertStatus = "duplicate";
          telemetry.duplicate_alerts += 1;
        } else {
          alertStatus = "would_create";
          seenAlerts.add(key);
        }
      }

      if (intelStatus === "would_create") {
        seenIntel.add(ident);
        persistPlan.push({
          record,
          alert: alertStatus === "would_create" ? alertEvent : null,
        });
      }

      proposed.push({
        catalyst_event_id: row.id,
        intelligence: intelStatus,
        alert: alertStatus,
        record,
      });
    } catch {
      telemetry.errors += 1;
      telemetry.events_skipped += 1;
      proposed.push({
        catalyst_event_id: row.id,
        intelligence: "skipped",
        alert: "suppressed",
        record: null,
      });
    }
  }

  telemetry.completed_at = new Date(deps.nowMs).toISOString();
  return { telemetry, proposed, persistPlan };
}

export async function executeProcessor(
  deps: {
    mode: "dry_run" | "write";
    flags: CatalystFlags;
    selection: IntelligenceSelection;
    nowMs: number;
    store: ProcessorStore;
  },
): Promise<{ ok: true; result: ProcessBatchResult } | { ok: false; reason: "DATABASE_ERROR" }> {
  const rows = await deps.store.loadCatalystEvents(deps.selection);
  if (rows === null) return { ok: false, reason: "DATABASE_ERROR" };

  const existingIntelligence = new Set<string>();
  const existingAlerts = new Set<string>();
  for (const row of applySelection(rows, deps.selection)) {
    const found = await deps.store.findIntelligenceIdentity(row.id, RULES_VERSION);
    if (found === null) return { ok: false, reason: "DATABASE_ERROR" };
    if (found) existingIntelligence.add(`${row.id}:${RULES_VERSION}`);
  }

  const planned = processCatalystIntelligenceBatch(rows, {
    ...deps,
    existingIntelligence,
    existingAlerts,
  });

  if (deps.mode !== "write") {
    planned.telemetry.writes_attempted = 0;
    planned.telemetry.catalyst_events_writes = 0;
    planned.telemetry.completed_at = new Date(deps.nowMs).toISOString();
    return { ok: true, result: { telemetry: planned.telemetry, writesAttempted: 0 } };
  }

  if (!deps.flags.catalystIntelligenceEnabled || !deps.flags.catalystIntelligenceWriteEnabled) {
    planned.telemetry.writes_attempted = 0;
    planned.telemetry.completed_at = new Date(deps.nowMs).toISOString();
    return { ok: true, result: { telemetry: planned.telemetry, writesAttempted: 0 } };
  }

  let writes = 0;
  for (const item of planned.persistPlan) {
    const inserted = await deps.store.insertIntelligence(toIntelligenceRow(item.record));
    writes += 1;
    if (!inserted.ok) {
      if (inserted.duplicate) {
        planned.telemetry.duplicate_intelligence += 1;
        continue;
      }
      return { ok: false, reason: "DATABASE_ERROR" };
    }

    if (!item.alert || !deps.flags.catalystAlertGenerationEnabled) continue;
    const alertRow = toAlertEventRow(item.alert);
    const existing = await deps.store.findAlertDedupe(alertRow.dedupe_key);
    if (existing === null) return { ok: false, reason: "DATABASE_ERROR" };
    if (existing) {
      planned.telemetry.duplicate_alerts += 1;
      continue;
    }
    const alertInsert = await deps.store.insertAlert(alertRow, inserted.id);
    writes += 1;
    if (!alertInsert.ok) {
      if (alertInsert.duplicate) {
        planned.telemetry.duplicate_alerts += 1;
        continue;
      }
      return { ok: false, reason: "DATABASE_ERROR" };
    }
  }

  planned.telemetry.writes_attempted = writes;
  planned.telemetry.catalyst_events_writes = 0;
  planned.telemetry.completed_at = new Date(deps.nowMs).toISOString();
  return { ok: true, result: { telemetry: planned.telemetry, writesAttempted: writes } };
}
