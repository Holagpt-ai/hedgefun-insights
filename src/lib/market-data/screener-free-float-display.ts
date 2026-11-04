import { formatRadarContextVolume } from "@/features/day-trade-radar-v2/radar-metrics";

export function formatScreenerVerifiedFreeFloat(
  shares: number | null | undefined,
  opts?: { pending?: boolean },
): string {
  if (opts?.pending && (shares === null || shares === undefined)) return "…";
  return formatRadarContextVolume(shares);
}
