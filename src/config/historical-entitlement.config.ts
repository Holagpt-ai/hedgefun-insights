/**
 * Provider entitlement floor for historical catch-up (Batch 33.5).
 * Optional env — when unset, only live provider timeframe denials are recorded.
 */

import { isBackfillDate } from "@/lib/historical-backfill/dates";

export const HISTORICAL_PROVIDER_ENTITLEMENT_FLOOR_ENV = "HISTORICAL_PROVIDER_ENTITLEMENT_FLOOR_DATE";
export const HISTORICAL_PROVIDER_ENTITLEMENT_PROBE_SYMBOL_ENV = "HISTORICAL_PROVIDER_ENTITLEMENT_PROBE_SYMBOL";

/** Liquid control symbol for floor validation probes only. */
export const HISTORICAL_PROVIDER_ENTITLEMENT_DEFAULT_PROBE_SYMBOL = "SPY";

export class HistoricalEntitlementConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoricalEntitlementConfigError";
  }
}

export type HistoricalEntitlementConfig = {
  floorDate: string | null;
  probeSymbol: string;
};

function readDateEnv(name: string, raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (!isBackfillDate(trimmed)) {
    throw new HistoricalEntitlementConfigError(`${name} must be YYYY-MM-DD (got ${JSON.stringify(raw)})`);
  }
  return trimmed;
}

function readProbeSymbol(raw: string | undefined): string {
  const trimmed = raw?.trim().toUpperCase();
  if (!trimmed) return HISTORICAL_PROVIDER_ENTITLEMENT_DEFAULT_PROBE_SYMBOL;
  if (!/^[A-Z][A-Z0-9.\-]{0,11}$/.test(trimmed)) {
    throw new HistoricalEntitlementConfigError(
      `${HISTORICAL_PROVIDER_ENTITLEMENT_PROBE_SYMBOL_ENV} must be a valid ticker symbol`,
    );
  }
  return trimmed;
}

export function readHistoricalEntitlementConfigFromEnv(
  env: { get(name: string): string | undefined } = { get: (name) => process.env[name] },
): HistoricalEntitlementConfig {
  return {
    floorDate: readDateEnv(
      HISTORICAL_PROVIDER_ENTITLEMENT_FLOOR_ENV,
      env.get(HISTORICAL_PROVIDER_ENTITLEMENT_FLOOR_ENV),
    ),
    probeSymbol: readProbeSymbol(env.get(HISTORICAL_PROVIDER_ENTITLEMENT_PROBE_SYMBOL_ENV)),
  };
}
