import type {
  MarketDataFeedMode,
  MarketDataProvider,
} from "../../../supabase/functions/_shared/market-feed/config.ts";
import {
  normalizeMarketDataFeedMode,
  normalizeMarketDataProvider,
} from "../../../supabase/functions/_shared/market-feed/config.ts";

/** @deprecated Use marketDataFeedMode — kept for logs/backward compat. */
export type MassiveWsMode = "delayed" | "realtime";

export type WorkerEnv = {
  polygonApiKey: string;
  radarBridgeUrl: string;
  radarWorkerSecret: string;
  port: number;
  marketDataProvider: MarketDataProvider;
  marketDataFeedMode: MarketDataFeedMode;
  /** Legacy mirror: delayed | realtime derived from feed mode / MASSIVE_WS_MODE. */
  massiveWsMode: MassiveWsMode;
  baselineMinSessions: number;
  baselineLookbackCalendarDays: number;
  radarSentinelEnabled: boolean;
  radarPersistenceV2Enabled: boolean;
  radarPersistenceV2CheckpointMs: number;
};

export const DEFAULT_RADAR_PERSISTENCE_V2_CHECKPOINT_MS = 30_000;
export const MIN_RADAR_PERSISTENCE_V2_CHECKPOINT_MS = 5_000;
export const MAX_RADAR_PERSISTENCE_V2_CHECKPOINT_MS = 300_000;

export type EnvReader = (key: string) => string | undefined;

export class EnvValidationError extends Error {
  readonly code: "missing_env" | "invalid_env";
  constructor(code: "missing_env" | "invalid_env") {
    super(code);
    this.name = "EnvValidationError";
    this.code = code;
  }
}

const DEFAULT_PORT = 8080;
const DEFAULT_MIN_SESSIONS = 120;
const DEFAULT_LOOKBACK_DAYS = 366;

function readRequired(read: EnvReader, key: string): string {
  const raw = read(key);
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new EnvValidationError("missing_env");
  }
  return raw.trim();
}

function readOptionalInt(
  read: EnvReader,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = read(key);
  if (raw === undefined || raw === null || raw.trim() === "") return fallback;
  if (!/^-?\d+$/.test(raw.trim())) throw new EnvValidationError("invalid_env");
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new EnvValidationError("invalid_env");
  }
  return n;
}

function parseHttpsUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new EnvValidationError("invalid_env");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new EnvValidationError("invalid_env");
  }
  if (parsed.username || parsed.password) {
    throw new EnvValidationError("invalid_env");
  }
  return raw.replace(/\/+$/, "");
}

function parseOptionalBool(
  read: EnvReader,
  key: string,
  fallback: boolean,
): boolean {
  const raw = read(key);
  if (raw === undefined || raw === null || raw.trim() === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  throw new EnvValidationError("invalid_env");
}

function legacyMassiveWsMode(feedMode: MarketDataFeedMode): MassiveWsMode {
  if (feedMode === "delayed") return "delayed";
  if (feedMode === "auto") return "realtime";
  return "realtime";
}

function parseMarketFeed(read: EnvReader): {
  provider: MarketDataProvider;
  feedMode: MarketDataFeedMode;
  massiveWsMode: MassiveWsMode;
} {
  try {
    const provider = normalizeMarketDataProvider(read("MARKET_DATA_PROVIDER"));
    const feedMode = normalizeMarketDataFeedMode(
      read("MARKET_DATA_FEED_MODE"),
      read("MASSIVE_WS_MODE"),
    );
    return {
      provider,
      feedMode,
      massiveWsMode: legacyMassiveWsMode(feedMode),
    };
  } catch {
    throw new EnvValidationError("invalid_env");
  }
}

export function loadEnv(read: EnvReader = (k) => Deno.env.get(k)): WorkerEnv {
  const polygonApiKey = readRequired(read, "POLYGON_API_KEY");
  const radarBridgeUrl = parseHttpsUrl(readRequired(read, "RADAR_BRIDGE_URL"));
  const radarWorkerSecret = readRequired(read, "RADAR_WORKER_SECRET");
  const marketFeed = parseMarketFeed(read);
  return {
    polygonApiKey,
    radarBridgeUrl,
    radarWorkerSecret,
    port: readOptionalInt(read, "PORT", DEFAULT_PORT, 1, 65535),
    marketDataProvider: marketFeed.provider,
    marketDataFeedMode: marketFeed.feedMode,
    massiveWsMode: marketFeed.massiveWsMode,
    baselineMinSessions: readOptionalInt(
      read,
      "BASELINE_MIN_SESSIONS",
      DEFAULT_MIN_SESSIONS,
      1,
      10_000,
    ),
    baselineLookbackCalendarDays: readOptionalInt(
      read,
      "BASELINE_LOOKBACK_CALENDAR_DAYS",
      DEFAULT_LOOKBACK_DAYS,
      1,
      3_660,
    ),
    radarSentinelEnabled: parseOptionalBool(
      read,
      "RADAR_SENTINEL_ENABLED",
      true,
    ),
    radarPersistenceV2Enabled: parseOptionalBool(
      read,
      "RADAR_PERSISTENCE_V2_ENABLED",
      true,
    ),
    radarPersistenceV2CheckpointMs: readOptionalInt(
      read,
      "RADAR_PERSISTENCE_V2_CHECKPOINT_MS",
      DEFAULT_RADAR_PERSISTENCE_V2_CHECKPOINT_MS,
      MIN_RADAR_PERSISTENCE_V2_CHECKPOINT_MS,
      MAX_RADAR_PERSISTENCE_V2_CHECKPOINT_MS,
    ),
  };
}
