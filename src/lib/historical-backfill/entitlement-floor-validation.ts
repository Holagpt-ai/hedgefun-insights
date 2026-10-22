import type { HistoricalEntitlementConfig } from "@/config/historical-entitlement.config";
import {
  classifyPolygonAggregateResponse,
  isProviderEntitlementTimeframeMessage,
  sanitizeProviderDiagnostics,
} from "@/lib/historical-backfill/provider-failure";
import {
  isMarketHoliday,
  isTradingDay,
  isWeekendDate,
  previousTradingDay,
} from "@/lib/market-calendar";

export type EntitlementFloorProbeResult = {
  httpStatus: number;
  providerStatus: string | null;
  providerMessage: string | null;
};

export class HistoricalEntitlementFloorValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoricalEntitlementFloorValidationError";
  }
}

function weekdayForDate(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function assertTradingSessionFloor(floor: string): void {
  const weekday = weekdayForDate(floor);
  if (isWeekendDate(weekday) || isMarketHoliday(floor) || !isTradingDay(floor, weekday)) {
    throw new HistoricalEntitlementFloorValidationError(
      `entitlement floor ${floor} is not a U.S. trading session`,
    );
  }
}

/**
 * Confirms the configured floor is a trading session, provider-accessible on that session,
 * and that the preceding applicable trading session is timeframe-restricted.
 */
export async function validateProviderEntitlementFloor(
  config: HistoricalEntitlementConfig,
  probe: (symbol: string, sessionDate: string) => Promise<EntitlementFloorProbeResult>,
): Promise<void> {
  const floor = config.floorDate;
  if (!floor) return;

  assertTradingSessionFloor(floor);

  const atFloor = await probe(config.probeSymbol, floor);
  const atFloorDiag = sanitizeProviderDiagnostics(atFloor.httpStatus, {
    status: atFloor.providerStatus,
    message: atFloor.providerMessage,
  });
  if (atFloor.httpStatus !== 200 || atFloor.providerStatus !== "OK") {
    throw new HistoricalEntitlementFloorValidationError(
      `entitlement floor ${floor} is not accessible for probe symbol ${config.probeSymbol} `
      + `(http=${atFloorDiag.httpStatus}, status=${atFloorDiag.providerStatus ?? "null"})`,
    );
  }

  const priorSession = previousTradingDay(floor).date;
  const beforeFloor = await probe(config.probeSymbol, priorSession);
  const beforeKind = classifyPolygonAggregateResponse(beforeFloor.httpStatus, {
    status: beforeFloor.providerStatus,
    message: beforeFloor.providerMessage,
  });
  if (
    beforeFloor.httpStatus === 200
    && beforeFloor.providerStatus === "OK"
    && !isProviderEntitlementTimeframeMessage(beforeFloor.providerMessage)
  ) {
    throw new HistoricalEntitlementFloorValidationError(
      `entitlement floor ${floor} is not aligned with provider access: `
      + `preceding session ${priorSession} is still accessible for ${config.probeSymbol}`,
    );
  }
  if (beforeKind !== "PROVIDER_ENTITLEMENT_TIMEFRAME" && beforeFloor.httpStatus !== 403) {
    throw new HistoricalEntitlementFloorValidationError(
      `entitlement floor ${floor} could not be validated: `
      + `expected timeframe restriction on preceding session ${priorSession} `
      + `(got http=${beforeFloor.httpStatus}, status=${beforeFloor.providerStatus ?? "null"})`,
    );
  }
}
