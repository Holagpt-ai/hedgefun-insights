import { useQuery } from "@tanstack/react-query";
import type { CatalystEvent } from "@/types/catalyst";
import { fetchPublicCatalystCalendarRange } from "@/lib/catalyst/public-catalyst-calendar";

export function monthBounds(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

/** Public-safe catalyst month query (RPC — no direct table read). */
export function useHomepageCalendarMonth(year: number, month: number) {
  const { from, to } = monthBounds(year, month);
  return useQuery<CatalystEvent[]>({
    queryKey: ["public-catalyst-calendar", from, to],
    queryFn: () => fetchPublicCatalystCalendarRange(from, to),
    staleTime: 60_000,
  });
}