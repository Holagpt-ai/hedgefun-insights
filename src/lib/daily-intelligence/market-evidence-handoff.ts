/**
 * Compact market-evidence payload for cross-workflow handoffs (sessionStorage).
 */

import { normalizeHandoffSymbol } from "@/lib/watchlist-v2/handoff";

export type MarketEvidenceContextScope = "current_session" | "prior_session";

export interface MarketEvidenceHandoff {
  symbol: string;
  securityId: string | null;
  contextScope: MarketEvidenceContextScope;
  sessionDate: string | null;
  sourceSurface: string;
  providerAsOf: string | null;
  price: number | null;
  volume: number | null;
  rvol5m: number | null;
  gapPercent: number | null;
  primaryScannerEvent: string | null;
  handoffAt: string;
  /** Signed-in account that stored this payload (prevents cross-account replay). */
  userId?: string | null;
}

/** Context-only handoffs expire; they never replace live quotes. */
export const MARKET_EVIDENCE_HANDOFF_MAX_AGE_MS = 24 * 3600_000;

const STORAGE_PREFIX = "stocksist-market-evidence:";

function storageKey(symbol: string): string {
  return `${STORAGE_PREFIX}${symbol.trim().toUpperCase()}`;
}

export function persistMarketEvidenceHandoff(payload: MarketEvidenceHandoff): void {
  if (typeof sessionStorage === "undefined") return;
  const symbol = normalizeHandoffSymbol(payload.symbol);
  if (!symbol) return;
  try {
    sessionStorage.setItem(storageKey(symbol), JSON.stringify({ ...payload, symbol }));
  } catch {
    // quota / privacy mode
  }
}

export function readMarketEvidenceHandoff(
  symbol: string,
  options?: { userId?: string | null; nowMs?: number },
): MarketEvidenceHandoff | null {
  const parsed = readMarketEvidenceHandoffRaw(symbol);
  if (!parsed) return null;
  return validateMarketEvidenceHandoff(parsed, options);
}

function readMarketEvidenceHandoffRaw(symbol: string): MarketEvidenceHandoff | null {
  if (typeof sessionStorage === "undefined") return null;
  const normalized = normalizeHandoffSymbol(symbol);
  if (!normalized) return null;
  try {
    const raw = sessionStorage.getItem(storageKey(normalized));
    if (!raw) return null;
    return JSON.parse(raw) as MarketEvidenceHandoff;
  } catch {
    return null;
  }
}

export function validateMarketEvidenceHandoff(
  payload: MarketEvidenceHandoff,
  options?: { userId?: string | null; nowMs?: number },
): MarketEvidenceHandoff | null {
  const symbol = normalizeHandoffSymbol(payload.symbol);
  if (!symbol) return null;
  const handoffMs = Date.parse(payload.handoffAt);
  const nowMs = options?.nowMs ?? Date.now();
  if (!Number.isFinite(handoffMs) || nowMs - handoffMs > MARKET_EVIDENCE_HANDOFF_MAX_AGE_MS) {
    return null;
  }
  const expectedUser = options?.userId?.trim();
  if (expectedUser && payload.userId && payload.userId !== expectedUser) {
    return null;
  }
  return { ...payload, symbol };
}

export function buildMarketEvidenceHandoff(input: {
  symbol: string;
  securityId?: string | null;
  contextScope: MarketEvidenceContextScope;
  sessionDate?: string | null;
  sourceSurface: string;
  providerAsOf?: string | null;
  price?: number | null;
  volume?: number | null;
  rvol5m?: number | null;
  gapPercent?: number | null;
  primaryScannerEvent?: string | null;
  nowMs?: number;
  userId?: string | null;
}): MarketEvidenceHandoff | null {
  const symbol = normalizeHandoffSymbol(input.symbol);
  if (!symbol) return null;
  return {
    symbol,
    securityId: input.securityId ?? null,
    contextScope: input.contextScope,
    sessionDate: input.sessionDate ?? null,
    sourceSurface: input.sourceSurface,
    providerAsOf: input.providerAsOf ?? null,
    price: finiteOrNull(input.price),
    volume: finiteOrNull(input.volume),
    rvol5m: finiteOrNull(input.rvol5m),
    gapPercent: finiteOrNull(input.gapPercent),
    primaryScannerEvent: input.primaryScannerEvent?.trim() || null,
    handoffAt: new Date(input.nowMs ?? Date.now()).toISOString(),
    userId: input.userId?.trim() || null,
  };
}

function finiteOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value;
}

/** Context-only label for Action Center / workflow surfaces (not a live quote). */
export function formatMarketEvidenceContextLine(evidence: MarketEvidenceHandoff): string {
  const scope =
    evidence.contextScope === "prior_session" ? "Prior session context" : "Current session context";
  const parts = [scope, evidence.sourceSurface.replace(/_/g, " ")];
  if (evidence.primaryScannerEvent) parts.push(evidence.primaryScannerEvent);
  if (evidence.providerAsOf) {
    try {
      parts.push(
        `observed ${new Date(evidence.providerAsOf).toLocaleString("en-US", {
          timeZone: "America/New_York",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })} ET`,
      );
    } catch {
      parts.push(`observed ${evidence.providerAsOf}`);
    }
  }
  return `Workflow context (not a live quote): ${parts.join(" · ")}`;
}
