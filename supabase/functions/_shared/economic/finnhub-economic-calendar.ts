/** Finnhub economic calendar → `economic_events` row shape (provider-neutral naming). */

export const ECONOMIC_SYNC_MAX_WINDOW_DAYS = 60;
export const ECONOMIC_FETCH_TIMEOUT_MS = 25_000;

export type EconomicEventUpsertRow = {
  dedupe_key: string;
  event_name: string;
  country: string | null;
  event_date: string;
  event_time: string | null;
  importance: string | null;
  actual_value: string | null;
  consensus_estimate: string | null;
  previous_value: string | null;
  units: string | null;
  source: string;
  source_url: string | null;
  provider: string;
  description: string | null;
  actual_reported_at: string | null;
};

export type FinnhubEconomicCalendarItem = {
  actual?: number | string | null;
  country?: string | null;
  estimate?: number | string | null;
  event?: string | null;
  impact?: string | null;
  prev?: number | string | null;
  time?: string | null;
  unit?: string | null;
};

function isYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function assertEconomicSyncWindow(from: string, to: string): void {
  if (!isYmd(from) || !isYmd(to)) throw new Error("invalid_date");
  if (from > to) throw new Error("inverted_range");
  const fromMs = Date.parse(`${from}T12:00:00Z`);
  const toMs = Date.parse(`${to}T12:00:00Z`);
  const days = Math.round((toMs - fromMs) / 86_400_000) + 1;
  if (days > ECONOMIC_SYNC_MAX_WINDOW_DAYS) throw new Error("window_too_large");
}

export function asDisplayValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const s = String(value).trim();
  return s.length ? s : null;
}

/**
 * Parse Finnhub `time` into ET calendar date + optional time.
 * Date-only strings keep null time and never set actual_reported_at.
 */
export function finnhubEconomicTimeParts(
  raw: string | null | undefined,
): { event_date: string; event_time: string | null } | null {
  if (!raw || !String(raw).trim()) return null;
  const s = String(raw).trim();

  if (isYmd(s)) {
    return { event_date: s, event_time: null };
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  const event_date = `${get("year")}-${get("month")}-${get("day")}`;
  if (!isYmd(event_date)) return null;
  const minute = get("minute");
  const second = get("second");
  const event_time = `${String(hour).padStart(2, "0")}:${minute}:${second}`;
  return { event_date, event_time };
}

export function economicSyncDateWindow(
  now = new Date(),
  pastDays = 14,
  futureDays = 45,
): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - pastDays);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + futureDays);
  return { from: fmt(from), to: fmt(to) };
}

export function parseFinnhubEconomicCalendarPayload(
  payload: unknown,
): { items: FinnhubEconomicCalendarItem[]; providerError: string | null } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { items: [], providerError: "malformed_payload" };
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.trim()) {
    return { items: [], providerError: record.error.trim() };
  }
  const raw = record.economicCalendar;
  if (!Array.isArray(raw)) {
    return { items: [], providerError: "missing_economic_calendar_array" };
  }
  const items: FinnhubEconomicCalendarItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    items.push(entry as FinnhubEconomicCalendarItem);
  }
  return { items, providerError: null };
}

function mapImportance(impact: string | null | undefined): string | null {
  if (!impact) return null;
  const v = impact.trim().toLowerCase();
  if (v === "high" || v === "medium" || v === "low") return v;
  return null;
}

export function buildEconomicRowsFromFinnhubItems(
  items: readonly FinnhubEconomicCalendarItem[],
): { rows: EconomicEventUpsertRow[]; providerCount: number; rejected: number } {
  const byKey = new Map<string, EconomicEventUpsertRow>();
  let rejected = 0;

  for (const item of items) {
    try {
      const title = typeof item.event === "string" ? item.event.trim() : "";
      if (!title) {
        rejected += 1;
        continue;
      }
      const when = finnhubEconomicTimeParts(item.time ?? null);
      if (!when) {
        rejected += 1;
        continue;
      }
      const country = typeof item.country === "string" && item.country.trim()
        ? item.country.trim().toUpperCase()
        : null;
      const actual = asDisplayValue(item.actual);
      const dedupe_key = `${country ?? "XX"}|${title.toLowerCase()}|${when.event_date}|${when.event_time ?? ""}`;
      const row: EconomicEventUpsertRow = {
        dedupe_key,
        event_name: title,
        country,
        event_date: when.event_date,
        event_time: when.event_time,
        importance: mapImportance(item.impact ?? null),
        actual_value: actual,
        consensus_estimate: asDisplayValue(item.estimate),
        previous_value: asDisplayValue(item.prev),
        units: typeof item.unit === "string" && item.unit.trim() ? item.unit.trim() : null,
        source: "Finnhub economic calendar",
        source_url: "https://finnhub.io/docs/api/economic-calendar",
        provider: "finnhub",
        description: null,
        actual_reported_at: actual ? new Date().toISOString() : null,
      };
      byKey.set(dedupe_key, row);
    } catch {
      rejected += 1;
    }
  }

  return { rows: [...byKey.values()], providerCount: items.length, rejected };
}