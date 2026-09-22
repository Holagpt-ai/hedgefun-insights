import { LATE_SESSION_HANDOFF_STORAGE_KEY } from "@/config/late-session-handoff.config";
import type { ContinuationCategory } from "@/config/continuation.config";
import { buildLateSessionContinuationContext, isLateSessionSourceCategory } from "@/lib/am-inbox/build-late-session-continuation-context";
import type {
  LateSessionContinuationContext,
  StoredLateSessionHandoff,
} from "@/lib/am-inbox/late-session-continuation-types";
import { readHistoricalWorkflowContext } from "@/lib/historical-workflow/workflow-handoff-storage";
import {
  evaluateScreenerContinuation,
  type ScreenerContinuationSource,
} from "@/lib/screeners/screener-continuation";
import type { SecurityId } from "@/types/security-identity";

function handoffKey(symbol: string, sourceSessionDate: string, category: string): string {
  return `${symbol.trim().toUpperCase()}:${sourceSessionDate}:${category}`;
}

export function readLateSessionHandoffStore(): Record<string, StoredLateSessionHandoff> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(LATE_SESSION_HANDOFF_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, StoredLateSessionHandoff>;
  } catch {
    return {};
  }
}

export function writeLateSessionHandoffStore(store: Record<string, StoredLateSessionHandoff>): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(LATE_SESSION_HANDOFF_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export function persistLateSessionHandoff(context: LateSessionContinuationContext): void {
  const store = readLateSessionHandoffStore();
  const key = handoffKey(context.symbol, context.sourceSessionDate, context.sourceCategory);
  store[key] = { context, storedAt: new Date().toISOString() };
  writeLateSessionHandoffStore(store);
}

export function listStoredLateSessionHandoffs(): StoredLateSessionHandoff[] {
  return Object.values(readLateSessionHandoffStore());
}

/**
 * Captures qualified late-session names for next AM Inbox (does not alter Discovery rank).
 */
export function captureLateSessionHandoffsFromScreenerRows(
  rows: readonly ScreenerContinuationSource[],
  input: {
    sessionDate: string;
    capturedAt?: string;
    securityIdBySymbol?: ReadonlyMap<string, SecurityId | null>;
  },
): number {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  let count = 0;

  for (const row of rows) {
    // Live Radar enrich path; continuation needs scorable metric freshness (not AM Inbox qualification).
    const view = evaluateScreenerContinuation(row, { freshnessState: "FRESH" });
    const categories = view.result.categories.filter(isLateSessionSourceCategory);
    if (categories.length === 0) continue;

    const workflow = readHistoricalWorkflowContext(row.symbol);
    const primary = pickPrimaryLateSessionCategory(categories);

    const context = buildLateSessionContinuationContext({
      symbol: row.symbol,
      securityId: input.securityIdBySymbol?.get(row.symbol.toUpperCase()) ?? workflow?.securityId ?? null,
      sourceSessionDate: input.sessionDate,
      sourceTimestamp: capturedAt,
      sourceCategory: primary,
      lastPrice: row.price ?? null,
      sessionMovePct: row.change_percent ?? null,
      volume: row.volume ?? null,
      rvol: row.rvol_20d ?? null,
      dollarVolume: null,
      closeDistanceFromHodPct: row.close_distance_from_hod_pct ?? null,
      afterHoursExtends: row.after_hours_extends === "TRUE"
        ? true
        : row.after_hours_extends === "FALSE"
          ? false
          : null,
      catalystPresent: row.continuation_catalyst_quality ? true : null,
      workflow,
    });

    persistLateSessionHandoff(context);
    count += 1;
  }

  return count;
}

function pickPrimaryLateSessionCategory(
  categories: readonly LateSessionSourceCategory[],
): LateSessionSourceCategory {
  const priority: LateSessionSourceCategory[] = [
    "POWER_HOUR_MOMENTUM",
    "STRONG_CLOSE_NEAR_HOD",
    "AFTER_HOURS_CONTINUATION",
    "DAY_TWO_WATCH",
  ];
  for (const category of priority) {
    if (categories.includes(category)) return category;
  }
  return categories[0]!;
}

export function resetLateSessionHandoffStoreForTests(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(LATE_SESSION_HANDOFF_STORAGE_KEY);
}
