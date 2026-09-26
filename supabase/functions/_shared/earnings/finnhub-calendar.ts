/** Earnings calendar row shape for public.earnings_calendar (decimal(8,4) EPS fields). */
export type EarningsCalendarUpsertRow = {
  symbol: string;
  company_name: string;
  report_date: string;
  estimate_eps: number | null;
  actual_eps: number | null;
  surprise_percent: number | null;
  time_of_day: "before_open" | "after_close" | "during";
};

export type FinnhubEarningsCalendarItem = {
  symbol?: string;
  date?: string;
  epsEstimate?: number | null;
  epsActual?: number | null;
  hour?: string;
};

export type ParseFinnhubEarningsResult = {
  rows: EarningsCalendarUpsertRow[];
  providerCount: number;
  rejected: number;
  sanitizedFields: number;
};

const EPS_PRECISION = 8;
const EPS_SCALE = 4;
const MAX_DECIMAL = 10 ** (EPS_PRECISION - EPS_SCALE) - 10 ** -EPS_SCALE;

export function finiteDecimalField(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (Math.abs(parsed) > MAX_DECIMAL) return null;
  return Number(parsed.toFixed(EPS_SCALE));
}

export function mapFinnhubTimeOfDay(hour: string | undefined): EarningsCalendarUpsertRow["time_of_day"] {
  if (!hour) return "during";
  if (hour === "bmo") return "before_open";
  if (hour === "amc") return "after_close";
  return "during";
}

export function computeSurprisePercent(
  estimate: number | null,
  actual: number | null,
): number | null {
  if (estimate === null || actual === null) return null;
  if (Math.abs(estimate) < 1e-9) return null;
  return finiteDecimalField(((actual - estimate) / Math.abs(estimate)) * 100);
}

function isYmdDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function finnhubEarningsDateWindow(now = new Date()): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const from = new Date(now);
  from.setDate(from.getDate() - 7);
  const to = new Date(now);
  to.setDate(to.getDate() + 7);
  return { from: fmt(from), to: fmt(to) };
}

export function parseFinnhubEarningsCalendarPayload(
  payload: unknown,
): { items: FinnhubEarningsCalendarItem[]; providerError: string | null } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { items: [], providerError: "malformed_payload" };
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.trim().length > 0) {
    return { items: [], providerError: record.error.trim() };
  }
  const raw = record.earningsCalendar;
  if (!Array.isArray(raw)) {
    return { items: [], providerError: null };
  }
  return { items: raw as FinnhubEarningsCalendarItem[], providerError: null };
}

export function buildEarningsRowsFromFinnhubItems(
  items: readonly FinnhubEarningsCalendarItem[],
): ParseFinnhubEarningsResult {
  const dedupMap = new Map<string, EarningsCalendarUpsertRow>();
  let rejected = 0;
  let sanitizedFields = 0;

  for (const item of items) {
    if (!item.symbol || !item.date || !isYmdDate(item.date)) {
      rejected += 1;
      continue;
    }

    const estimateRaw = item.epsEstimate ?? null;
    const actualRaw = item.epsActual ?? null;
    const estimate_eps = finiteDecimalField(estimateRaw);
    const actual_eps = finiteDecimalField(actualRaw);
    if (estimateRaw !== null && estimateRaw !== undefined && estimate_eps === null) sanitizedFields += 1;
    if (actualRaw !== null && actualRaw !== undefined && actual_eps === null) sanitizedFields += 1;

    const surprise_percent = computeSurprisePercent(estimate_eps, actual_eps);
    const row: EarningsCalendarUpsertRow = {
      symbol: item.symbol.trim().toUpperCase(),
      company_name: item.symbol.trim().toUpperCase(),
      report_date: item.date,
      estimate_eps,
      actual_eps,
      surprise_percent,
      time_of_day: mapFinnhubTimeOfDay(item.hour),
    };

    const key = `${row.symbol}-${row.report_date}`;
    const existing = dedupMap.get(key);
    if (!existing || (row.actual_eps !== null && existing.actual_eps === null)) {
      dedupMap.set(key, row);
    }
  }

  return {
    rows: Array.from(dedupMap.values()),
    providerCount: items.length,
    rejected,
    sanitizedFields,
  };
}
