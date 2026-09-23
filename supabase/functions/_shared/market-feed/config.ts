/**
 * Provider-neutral market feed configuration (Scanner Phase 3).
 * Polygon/Massive is the current adapter; scanner logic consumes normalized modes only.
 */

export const MARKET_DATA_PROVIDERS = ["polygon"] as const;
export type MarketDataProvider = (typeof MARKET_DATA_PROVIDERS)[number];

export const MARKET_DATA_FEED_MODES = [
  "realtime",
  "streaming",
  "near_realtime",
  "delayed",
  /** Try fastest socket first; fall back to delayed on auth/entitlement failure. */
  "auto",
] as const;
export type MarketDataFeedMode = (typeof MARKET_DATA_FEED_MODES)[number];

/** Massive/Polygon websocket host selection (adapter detail). */
export type MassiveWsEndpoint = "realtime" | "delayed";

export function isMarketDataProvider(v: unknown): v is MarketDataProvider {
  return typeof v === "string" &&
    (MARKET_DATA_PROVIDERS as readonly string[]).includes(v);
}

export function isMarketDataFeedMode(v: unknown): v is MarketDataFeedMode {
  return typeof v === "string" &&
    (MARKET_DATA_FEED_MODES as readonly string[]).includes(v);
}

export function normalizeMarketDataProvider(raw: string | undefined): MarketDataProvider {
  if (raw === undefined || raw.trim() === "") return "polygon";
  const v = raw.trim().toLowerCase();
  if (v === "polygon" || v === "massive") return "polygon";
  throw new Error("invalid_market_data_provider");
}

export function normalizeMarketDataFeedMode(
  raw: string | undefined,
  legacyMassiveWsMode?: string | undefined,
): MarketDataFeedMode {
  if (raw !== undefined && raw.trim() !== "") {
    const v = raw.trim().toLowerCase();
    if (isMarketDataFeedMode(v)) return v;
    throw new Error("invalid_market_data_feed_mode");
  }
  if (legacyMassiveWsMode !== undefined && legacyMassiveWsMode.trim() !== "") {
    const leg = legacyMassiveWsMode.trim().toLowerCase();
    if (leg === "realtime") return "realtime";
    if (leg === "delayed") return "delayed";
    throw new Error("invalid_market_data_feed_mode");
  }
  return "auto";
}

/** Maps canonical feed mode to Massive websocket endpoint tier. */
export function massiveEndpointForFeedMode(
  mode: MarketDataFeedMode,
): MassiveWsEndpoint {
  if (mode === "delayed") return "delayed";
  if (mode === "realtime" || mode === "streaming" || mode === "near_realtime") {
    return "realtime";
  }
  return "realtime";
}

export function wsUrlForMassiveEndpoint(endpoint: MassiveWsEndpoint): string {
  return endpoint === "realtime"
    ? "wss://socket.massive.com/stocks"
    : "wss://delayed.massive.com/stocks";
}

export function wsUrlForFeedConfig(opts: {
  provider: MarketDataProvider;
  mode: MarketDataFeedMode;
  activeEndpoint?: MassiveWsEndpoint;
}): string {
  if (opts.provider !== "polygon") {
    throw new Error("unsupported_market_data_provider");
  }
  const endpoint = opts.activeEndpoint ??
    massiveEndpointForFeedMode(opts.mode);
  return wsUrlForMassiveEndpoint(endpoint);
}
