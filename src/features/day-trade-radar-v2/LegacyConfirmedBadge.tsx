import {
  LEGACY_CONFIRMED_BADGE,
  LEGACY_CONFIRMED_DETAIL,
} from "@/lib/screeners/legacy-confirmation";

interface LegacyConfirmedBadgeProps {
  confirmed?: boolean;
}

/** Compact per-row overlay. Hidden unless all three validated legacy gates pass. */
export function LegacyConfirmedBadge({ confirmed }: LegacyConfirmedBadgeProps) {
  if (!confirmed) return null;
  return (
    <span
      className="rounded bg-muted/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
      title={LEGACY_CONFIRMED_DETAIL}
    >
      {LEGACY_CONFIRMED_BADGE}
    </span>
  );
}
