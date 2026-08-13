export type MassiveWsMode = "delayed" | "realtime";

export type WorkerEnv = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  polygonApiKey: string;
  port: number;
  massiveWsMode: MassiveWsMode;
  baselineMinSessions: number;
  baselineLookbackCalendarDays: number;
};

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

function parseSupabaseUrl(raw: string): string {
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

function parseWsMode(read: EnvReader): MassiveWsMode {
  const raw = read("MASSIVE_WS_MODE");
  if (raw === undefined || raw === null || raw.trim() === "") return "delayed";
  const mode = raw.trim().toLowerCase();
  if (mode === "delayed" || mode === "realtime") return mode;
  throw new EnvValidationError("invalid_env");
}

export function loadEnv(read: EnvReader = (k) => Deno.env.get(k)): WorkerEnv {
  const supabaseUrl = parseSupabaseUrl(readRequired(read, "SUPABASE_URL"));
  const supabaseServiceRoleKey = readRequired(
    read,
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  const polygonApiKey = readRequired(read, "POLYGON_API_KEY");
  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    polygonApiKey,
    port: readOptionalInt(read, "PORT", DEFAULT_PORT, 1, 65535),
    massiveWsMode: parseWsMode(read),
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
  };
}
