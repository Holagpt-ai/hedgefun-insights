import { addCalendarDays, isBackfillDate } from "@/lib/historical-backfill/dates";

export type SymbolSegment = {
  symbol: string;
  exchange: string | null;
  dateFrom: string;
  dateTo: string;
};

export type SegmentPlanItem =
  | { kind: "fetch"; segment: SymbolSegment }
  | {
    kind: "config_entitlement_gap";
    symbol: string;
    exchange: string | null;
    dateFrom: string;
    dateTo: string;
  };

/**
 * Splits a symbol segment around a configured entitlement floor.
 * Dates strictly before the floor are marked as config gaps; entitled tail is fetched.
 */
export function planSegmentWithEntitlementFloor(
  segment: SymbolSegment,
  entitlementFloor: string | null,
): SegmentPlanItem[] {
  if (!entitlementFloor || !isBackfillDate(entitlementFloor)) {
    return [{ kind: "fetch", segment }];
  }
  if (segment.dateFrom >= entitlementFloor) {
    return [{ kind: "fetch", segment }];
  }
  const gapTo = minDate(addCalendarDays(entitlementFloor, -1), segment.dateTo);
  const items: SegmentPlanItem[] = [];
  if (segment.dateFrom <= gapTo) {
    items.push({
      kind: "config_entitlement_gap",
      symbol: segment.symbol,
      exchange: segment.exchange,
      dateFrom: segment.dateFrom,
      dateTo: gapTo,
    });
  }
  if (segment.dateTo >= entitlementFloor) {
    items.push({
      kind: "fetch",
      segment: {
        ...segment,
        dateFrom: entitlementFloor,
      },
    });
  }
  return items;
}

function minDate(left: string, right: string): string {
  return left < right ? left : right;
}
