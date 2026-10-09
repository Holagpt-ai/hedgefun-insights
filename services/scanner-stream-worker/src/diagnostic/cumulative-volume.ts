import { resolveCumulativeSessionVolume } from "../../../../src/lib/radar/cumulative-session-volume.ts";

export type CumulativeVolumeDiagnostic = {
  symbol: string;
  queried_at: string;
  polygon: {
    day_v: number | null;
    min_av: number | null;
    updated: number | null;
    session: string | null;
    http_status: number | null;
    error: string | null;
  };
  resolver: ReturnType<typeof resolveCumulativeSessionVolume>;
  comparisons: {
    resolver_over_day_v: number | null;
    resolver_over_min_av: number | null;
  };
};

export async function fetchPolygonSnapshotFields(
  symbol: string,
  polygonApiKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<CumulativeVolumeDiagnostic["polygon"]> {
  const url =
    `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(symbol)}?apiKey=${encodeURIComponent(polygonApiKey)}`;
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      return {
        day_v: null,
        min_av: null,
        updated: null,
        session: null,
        http_status: res.status,
        error: "polygon_http_error",
      };
    }
    const body = await res.json() as { ticker?: Record<string, unknown> };
    const t = body.ticker;
    const day = t?.day as { v?: number } | undefined;
    const min = t?.min as { av?: number } | undefined;
    const market = t?.market as { session?: string } | undefined;
    return {
      day_v: typeof day?.v === "number" ? day.v : null,
      min_av: typeof min?.av === "number" ? min.av : null,
      updated: typeof t?.updated === "number" ? t.updated : null,
      session: typeof market?.session === "string" ? market.session : null,
      http_status: res.status,
      error: null,
    };
  } catch {
    return {
      day_v: null,
      min_av: null,
      updated: null,
      session: null,
      http_status: null,
      error: "polygon_fetch_failed",
    };
  }
}

export async function buildCumulativeVolumeDiagnostic(input: {
  symbol: string;
  polygonApiKey: string;
  providerAccumulatedVolume?: number | null;
  metricsSessionVolume?: number | null;
  geometrySessionVolumeSum?: number | null;
  snapshotDayVolume?: number | null;
  fetchFn?: typeof fetch;
}): Promise<CumulativeVolumeDiagnostic> {
  const polygon = await fetchPolygonSnapshotFields(
    input.symbol,
    input.polygonApiKey,
    input.fetchFn,
  );
  const resolver = resolveCumulativeSessionVolume({
    providerAccumulatedVolume: input.providerAccumulatedVolume ?? polygon.min_av,
    metricsSessionVolume: input.metricsSessionVolume ?? 0,
    geometrySessionVolumeSum: input.geometrySessionVolumeSum ?? null,
    snapshotDayVolume: input.snapshotDayVolume ?? polygon.day_v,
  });
  const vol = resolver.volume;
  return {
    symbol: input.symbol.toUpperCase(),
    queried_at: new Date().toISOString(),
    polygon,
    resolver,
    comparisons: {
      resolver_over_day_v: polygon.day_v && polygon.day_v > 0
        ? Math.round((vol / polygon.day_v) * 1000) / 1000
        : null,
      resolver_over_min_av: polygon.min_av && polygon.min_av > 0
        ? Math.round((vol / polygon.min_av) * 1000) / 1000
        : null,
    },
  };
}
