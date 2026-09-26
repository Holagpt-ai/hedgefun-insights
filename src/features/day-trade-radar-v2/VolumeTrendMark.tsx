import { CLOSED_VOLUME_TREND_CONTEXT } from "@/lib/screeners/radar-closed-snapshot";
import { mapVolumeTrend, type VolumeTrendLabel } from "./multi-radar";

export type VolumeTrendMotion = "up" | "down" | "none";

export function volumeTrendMotion(label: VolumeTrendLabel | "—"): VolumeTrendMotion {
  if (label === "RISING ↑" || label === "SURGING ↑↑" || label === "EXTREME ↑↑") return "up";
  if (label === "COOLING ↓") return "down";
  return "none";
}

export function volumeTrendColorClass(label: VolumeTrendLabel | "—"): string {
  const motion = volumeTrendMotion(label);
  if (motion === "up") return "text-green-600";
  if (motion === "down") return "text-red-600";
  return "text-muted-foreground";
}

function splitArrows(label: string): { text: string; arrows: string } {
  const match = /^(.*?)(\s*[↑↓]+)$/.exec(label);
  if (!match) return { text: label, arrows: "" };
  return { text: match[1], arrows: match[2] };
}

export function VolumeTrendMark({
  accelerationPct,
  className = "",
  live = true,
}: {
  accelerationPct: number | null | undefined;
  className?: string;
  /** False after close: keep the last color, stop the arrow, and label the state. */
  live?: boolean;
}) {
  const trend = mapVolumeTrend(accelerationPct);
  const motion = volumeTrendMotion(trend.label);
  const { text, arrows } = splitArrows(trend.label);
  const motionClass = !live
    ? ""
    : motion === "up"
    ? "motion-safe:animate-volume-trend-up"
    : motion === "down"
    ? "motion-safe:animate-volume-trend-down"
    : "";
  return (
    <span
      title={trend.title}
      data-volume-trend={trend.label}
      data-volume-motion={live ? motion : "none"}
      data-volume-context={live ? "live" : "last-active"}
      className={`inline-flex items-baseline whitespace-nowrap font-semibold tracking-wide ${volumeTrendColorClass(trend.label)} ${className}`}
    >
      <span>{text}</span>
      {arrows ? (
        <span className={`inline-block ${motionClass}`}>{arrows}</span>
      ) : null}
      {!live && trend.label !== "—" ? (
        <span className="ml-1 text-[10px] font-medium tracking-normal text-muted-foreground">
          {CLOSED_VOLUME_TREND_CONTEXT}
        </span>
      ) : null}
    </span>
  );
}
