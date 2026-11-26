import { useQuery } from "@tanstack/react-query";
import { getTickerDetails, getTickerSnapshot } from "@/lib/polygon";
import { fetchChartAggregateBars } from "@/lib/stock-chart/fetch-aggregates";

export function useCalendarTickerPreview(symbol: string | null, enabled: boolean) {
  const upper = symbol?.toUpperCase() ?? "";

  const snapshotQuery = useQuery({
    queryKey: ["cal-preview-snapshot", upper],
    queryFn: () => getTickerSnapshot(upper),
    enabled: enabled && !!upper,
    staleTime: 60_000,
    retry: 1,
  });

  const detailsQuery = useQuery({
    queryKey: ["cal-preview-details", upper],
    queryFn: () => getTickerDetails(upper),
    enabled: enabled && !!upper,
    staleTime: 300_000,
    retry: 1,
  });

  const sparkQuery = useQuery({
    queryKey: ["cal-preview-spark", upper],
    queryFn: async () => {
      const bundle = await fetchChartAggregateBars(upper, "5D");
      return bundle.bars.map((b) => ({
        t: b.utcMs,
        o: b.open,
        h: b.high,
        l: b.low,
        c: b.close,
        v: b.volume,
      }));
    },
    enabled: enabled && !!upper,
    staleTime: 120_000,
    retry: 1,
  });

  return {
    snapshot: snapshotQuery.data,
    details: detailsQuery.data,
    sparkline: sparkQuery.data ?? [],
    isLoading: snapshotQuery.isLoading || sparkQuery.isLoading,
    isError: snapshotQuery.isError,
  };
}