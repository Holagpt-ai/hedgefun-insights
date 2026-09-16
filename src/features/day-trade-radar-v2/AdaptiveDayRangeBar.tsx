import { isFiniteNumber } from "@/lib/screeners/contract";
import { formatHodDistance, formatRadarPrice } from "./radar-metrics";

/** Reserved marker kinds for a later sprint. Only `last` is rendered now. */
export type AdaptiveRangeMarkerKind = "last" | "vwap" | "trigger" | "news";

export interface AdaptiveRangeMarker {
  kind: AdaptiveRangeMarkerKind;
  positionPct: number;
  label?: string;
}

/**
 * Independent 0–100 position of last price inside this row's session range.
 * Null when any input is missing. Zero-width range is 50 so the marker stays visible.
 */
export function dayRangePositionPct(
  price: number | null | undefined,
  dayLow: number | null | undefined,
  dayHigh: number | null | undefined,
): number | null {
  if (!isFiniteNumber(price) || !isFiniteNumber(dayLow) || !isFiniteNumber(dayHigh)) {
    return null;
  }
  const span = (dayHigh as number) - (dayLow as number);
  if (span === 0) return 50;
  const raw = ((price as number) - (dayLow as number)) / span;
  return Math.min(100, Math.max(0, Math.round(raw * 1000) / 10));
}

function markerGlyph(kind: AdaptiveRangeMarkerKind): string {
  if (kind === "vwap") return "V";
  if (kind === "trigger") return "▲";
  if (kind === "news") return "N";
  return "●";
}

interface AdaptiveDayRangeBarProps {
  price: number | null | undefined;
  dayLow: number | null | undefined;
  dayHigh: number | null | undefined;
  hodDistancePercent?: number | null;
  /** Future VWAP / trigger / news markers. Never guessed in this sprint. */
  extraMarkers?: readonly AdaptiveRangeMarker[];
  compact?: boolean;
}

export function AdaptiveDayRangeBar({
  price,
  dayLow,
  dayHigh,
  hodDistancePercent,
  extraMarkers = [],
  compact = false,
}: AdaptiveDayRangeBarProps) {
  const position = dayRangePositionPct(price, dayLow, dayHigh);
  if (position === null) {
    return (
      <div className="text-[11px] text-muted-foreground" data-testid="adaptive-day-range">
        Unavailable
      </div>
    );
  }

  const markers: AdaptiveRangeMarker[] = [
    { kind: "last", positionPct: position },
    ...extraMarkers.filter((marker) => marker.kind !== "last"),
  ];

  return (
    <div className="min-w-[132px]" data-testid="adaptive-day-range" data-position={String(position)}>
      <div className="flex items-center gap-1.5 tabular-nums">
        <span className="w-[44px] shrink-0 text-[10px] text-muted-foreground">
          {formatRadarPrice(dayLow)}
        </span>
        <div className="relative h-1.5 min-w-0 flex-1 rounded-full bg-muted">
          {markers.map((marker) => (
            <span
              key={`${marker.kind}-${marker.positionPct}`}
              data-testid={marker.kind === "last" ? "range-last-marker" : `range-marker-${marker.kind}`}
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${
                marker.kind === "last"
                  ? "h-2.5 w-2.5 rounded-full bg-foreground"
                  : "text-[9px] font-semibold leading-none text-muted-foreground"
              }`}
              style={{ left: `${marker.positionPct}%` }}
              title={marker.label ?? marker.kind}
            >
              {marker.kind === "last" ? null : markerGlyph(marker.kind)}
            </span>
          ))}
        </div>
        <span className="w-[44px] shrink-0 text-right text-[10px] text-muted-foreground">
          {formatRadarPrice(dayHigh)}
        </span>
      </div>
      {!compact && (
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          {hodDistancePercent === null || hodDistancePercent === undefined
            ? "HOD Unavailable"
            : `${formatHodDistance(hodDistancePercent)} below HOD`}
        </div>
      )}
    </div>
  );
}
