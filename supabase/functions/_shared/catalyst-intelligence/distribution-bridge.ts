import type { CatalystEventRow } from "../catalyst/contract.ts";
import { sanitizeSummary, type CatalystSummary, makeEmptySummary } from "../catalyst/sanitize.ts";
import type { CatalystIntelStore } from "./persistence.ts";
import {
  assessIntelDistributionEligibility,
  type IntelDistributionEligibilityInput,
  type IntelDistributionRejectCode,
} from "./distribution-eligibility.ts";
import {
  assessPublicFeedCollision,
  projectIntelToPublicCatalystRow,
  type PublicFeedCollisionResult,
} from "./distribution-projection.ts";
import type { CanonicalEvent, EvidenceRecord, TickerLink } from "./types.ts";

export const CATALYST_INTEL_DISTRIBUTION_WRITES_ENV = "CATALYST_INTEL_DISTRIBUTION_WRITES_ENABLED";

export interface IntelDistributionBundle {
  event: CanonicalEvent;
  tickers: readonly TickerLink[];
  evidence: readonly EvidenceRecord[];
  persistMetadata?: Record<string, unknown>;
  companyName?: string | null;
}

export interface IntelDistributionAuthorization {
  /** Explicit operator intent. Default false in all production paths. */
  operatorAuthorized: boolean;
  /** When true, upsert runs only if env CATALYST_INTEL_DISTRIBUTION_WRITES_ENABLED === "true". */
  enableWrites?: boolean;
}

export type IntelDistributionItemOutcome =
  | { status: "projected"; dedupe_key: string }
  | { status: "dry_run"; dedupe_key: string }
  | { status: "upserted"; dedupe_key: string }
  | { status: "rejected"; code: IntelDistributionRejectCode | "missing_event_date" | "missing_ticker" | "collision" | "writes_disabled"; detail: string | null }
  | { status: "skipped_collision"; dedupe_key: string; collision: PublicFeedCollisionResult };

export interface IntelDistributionBatchResult {
  mode: "dry_run" | "write";
  summary: CatalystSummary & {
    eligible: number;
    projected: number;
    rejected: number;
    skipped_collision: number;
    upserted: number;
  };
  items: IntelDistributionItemOutcome[];
}

function readsDistributionWritesEnabled(): boolean {
  try {
    const flag = Deno.env.get(CATALYST_INTEL_DISTRIBUTION_WRITES_ENV);
    return flag === "true" || flag === "1";
  } catch {
    return false;
  }
}

export function resolveIntelDistributionWriteMode(
  authorization: IntelDistributionAuthorization,
): "dry_run" | "write" | "blocked" {
  if (!authorization.operatorAuthorized) return "dry_run";
  if (!authorization.enableWrites) return "dry_run";
  return readsDistributionWritesEnabled() ? "write" : "blocked";
}

export async function loadIntelDistributionBundle(
  store: CatalystIntelStore,
  eventId: string,
): Promise<IntelDistributionBundle | null> {
  const event = await store.getEvent(eventId);
  if (!event) return null;
  const [tickers, evidence] = await Promise.all([
    store.listTickers(eventId),
    store.listEvidence(eventId),
  ]);
  const facts = event.scoreComponents?.distribution_catalyst_facts;
  const persistMetadata =
    facts && typeof facts === "object" && !Array.isArray(facts)
      ? (facts as Record<string, unknown>)
      : undefined;
  return { event, tickers, evidence, persistMetadata };
}

export function evaluateIntelDistributionBundle(
  bundle: IntelDistributionBundle,
  ctx: {
    now: Date;
    existingPublicDedupeKeys?: ReadonlySet<string>;
  },
): IntelDistributionItemOutcome {
  const eligibilityInput: IntelDistributionEligibilityInput = {
    event: bundle.event,
    tickers: bundle.tickers,
    evidence: bundle.evidence,
    persistMetadata: bundle.persistMetadata,
    now: ctx.now,
  };

  const eligibility = assessIntelDistributionEligibility(eligibilityInput);
  if (!eligibility.eligible) {
    return {
      status: "rejected",
      code: eligibility.rejectCode ?? "unverified_insufficient",
      detail: eligibility.detail,
    };
  }

  const projected = projectIntelToPublicCatalystRow({
    event: bundle.event,
    tickers: bundle.tickers,
    evidence: bundle.evidence,
    persistMetadata: bundle.persistMetadata,
    companyName: bundle.companyName ?? null,
  });

  if (!projected.row) {
    return {
      status: "rejected",
      code: projected.rejectReason ?? "missing_event_date",
      detail: projected.rejectReason,
    };
  }

  const collision = assessPublicFeedCollision({
    projected: projected.row,
    existingDedupeKeys: ctx.existingPublicDedupeKeys ?? new Set<string>(),
  });

  if (collision.action === "skip_intel_preserve_existing") {
    return {
      status: "skipped_collision",
      dedupe_key: projected.row.dedupe_key,
      collision,
    };
  }

  return { status: "projected", dedupe_key: projected.row.dedupe_key };
}

export function projectIntelDistributionRow(
  bundle: IntelDistributionBundle,
  ctx: { now: Date },
): CatalystEventRow | null {
  const outcome = evaluateIntelDistributionBundle(bundle, { ...ctx, existingPublicDedupeKeys: new Set() });
  if (outcome.status !== "projected" && outcome.status !== "dry_run") return null;
  const projected = projectIntelToPublicCatalystRow({
    event: bundle.event,
    tickers: bundle.tickers,
    evidence: bundle.evidence,
    persistMetadata: bundle.persistMetadata,
    companyName: bundle.companyName ?? null,
  });
  return projected.row;
}

export async function runIntelDistributionBatch(input: {
  bundles: readonly IntelDistributionBundle[];
  now: Date;
  authorization: IntelDistributionAuthorization;
  existingPublicDedupeKeys?: ReadonlySet<string>;
  upsert?: (rows: CatalystEventRow[]) => Promise<number>;
}): Promise<IntelDistributionBatchResult> {
  const writeMode = resolveIntelDistributionWriteMode(input.authorization);
  const summary = {
    ...makeEmptySummary(),
    eligible: 0,
    projected: 0,
    rejected: 0,
    skipped_collision: 0,
    upserted: 0,
  };
  const items: IntelDistributionItemOutcome[] = [];
  const toWrite: CatalystEventRow[] = [];

  for (const bundle of input.bundles) {
    const outcome = evaluateIntelDistributionBundle(bundle, {
      now: input.now,
      existingPublicDedupeKeys: input.existingPublicDedupeKeys,
    });

    if (outcome.status === "rejected") {
      summary.rejected += 1;
      items.push(outcome);
      continue;
    }
    if (outcome.status === "skipped_collision") {
      summary.skipped_collision += 1;
      items.push(outcome);
      continue;
    }

    summary.eligible += 1;
    summary.projected += 1;

    const row = projectIntelDistributionRow(bundle, { now: input.now });
    if (!row) {
      summary.rejected += 1;
      summary.projected -= 1;
      items.push({ status: "rejected", code: "missing_event_date", detail: "projection_failed" });
      continue;
    }

    if (writeMode === "write" && input.upsert) {
      toWrite.push(row);
      items.push({ status: "upserted", dedupe_key: row.dedupe_key });
    } else if (writeMode === "blocked" && input.authorization.enableWrites) {
      items.push({
        status: "rejected",
        code: "writes_disabled",
        detail: CATALYST_INTEL_DISTRIBUTION_WRITES_ENV,
      });
      summary.rejected += 1;
    } else {
      items.push({ status: "dry_run", dedupe_key: row.dedupe_key });
    }
  }

  if (writeMode === "write" && toWrite.length > 0 && input.upsert) {
    const n = await input.upsert(toWrite);
    summary.upserted = n;
    summary.events_upserted = n;
  }

  const base = sanitizeSummary({
    ...makeEmptySummary(),
    events_rejected: summary.rejected,
    events_upserted: summary.upserted,
  });

  return {
    mode: writeMode === "write" ? "write" : "dry_run",
    summary: {
      ...base,
      eligible: summary.eligible,
      projected: summary.projected,
      rejected: summary.rejected,
      skipped_collision: summary.skipped_collision,
      upserted: summary.upserted,
    },
    items,
  };
}
