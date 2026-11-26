/** Finnhub economic calendar → `economic_events` row shape (provider-neutral naming). */

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
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function asDisplayValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(n)) return String(n);
  const s = String(value).trim();
  return s.length ? s : null;
}

/** Parse Finnhub `time` (ISO or date) into ET calendar date + optional HH:MM:SS. */
export function finnhubEconomicTimeParts(
  raw: string | null | undefined,
): { event_date: string; event_time: string | null; actual_reported_at: string | null } | null {
  if (!raw || !String(raw).trim()) return null;
  const s = String(raw).trim();
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
  return { event_date, event_time, actual_reported_at: d.toISOString() };
}

export function economicSyncDateWindow(
  now = new Date(),
  pastDays = 14,
  futureDays = 45,
): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const from = new Date(now);
  from.setDate(from.getDate() - pastDays);
  const to = new Date(now);
  to.setDate(to.getDate() + futureDays);
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
  return { items: raw as FinnhubEconomicCalendarItem[], providerError: null };
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
  const rows: EconomicEventUpsertRow[] = [];
  let rejected = 0;
  for (const item of items) {
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
    const dedupe_key = `${country ?? "XX"}|${title.toLowerCase()}|${when.event_date}|${when.event_time ?? ""}`;
    rows.push({
      dedupe_key,
      event_name: title,
      country,
      event_date: when.event_date,
      event_time: when.event_time,
      importance: mapImportance(item.impact ?? null),
      actual_value: asDisplayValue(item.actual),
      consensus_estimate: asDisplayValue(item.estimate),
      previous_value: asDisplayValue(item.prev),
      units: typeof item.unit === "string" && item.unit.trim() ? item.unit.trim() : null,
      source: "Finnhub economic calendar",
      source_url: "https://finnhub.io/docs/api/economic-calendar",
      provider: "finnhub",
      description: null,
      actual_reported_at: when.actual_reported_at,
    });
  }
  return { rows, providerCount: items.length, rejected };
}