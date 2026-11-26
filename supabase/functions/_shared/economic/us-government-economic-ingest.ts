import type { EconomicEventUpsertRow } from "./finnhub-economic-calendar.ts";
import { ECONOMIC_FETCH_TIMEOUT_MS } from "./finnhub-economic-calendar.ts";

const BLS_SCHEDULE_URL = "https://www.bls.gov/schedule/news_release/current_year.htm";
const FED_NEWSEVENTS_BASE = "https://www.federalreserve.gov/newsevents";

const BLS_TRACKED_RELEASES = new Map<string, string>([
  ["employment situation", "Employment Situation"],
  ["consumer price index", "Consumer Price Index"],
  ["producer price index", "Producer Price Index"],
  ["import and export price indexes", "Import and Export Price Indexes"],
  ["job openings and labor turnover", "Job Openings and Labor Turnover Survey"],
  ["real earnings", "Real Earnings"],
]);

const FED_MONTH_SLUGS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const;

const US_GOV_SOURCE_KEYS = ["bls_schedule", "federal_reserve_fomc"] as const;

export type UsGovernmentIngestResult = {
  rows: EconomicEventUpsertRow[];
  sourcesSucceeded: string[];
  sourcesFailed: string[];
  errors: string[];
  partialCoverage: boolean;
  allSourcesFailed: boolean;
};

export function summarizeUsGovernmentSyncOutcome(gov: UsGovernmentIngestResult): {
  ok: boolean;
  partialCoverage: boolean;
  shouldPersistSuccessMetadata: boolean;
} {
  const ok = !gov.allSourcesFailed;
  return {
    ok,
    partialCoverage: gov.partialCoverage,
    shouldPersistSuccessMetadata: gov.sourcesSucceeded.length > 0,
  };
}

function isYmd(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function inWindow(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

function normalizeBlsReleaseTitle(raw: string): string | null {
  const key = raw.toLowerCase().replace(/\s+/g, " ").trim();
  for (const [needle, canonical] of BLS_TRACKED_RELEASES) {
    if (key.includes(needle)) return canonical;
  }
  return null;
}

/** Parse abbreviated BLS dates such as `Nov. 06, 2026` or `December 04, 2026`. */
export function parseBlsReleaseDate(raw: string): string | null {
  const cleaned = raw.replace(/\./g, "").replace(/\s+/g, " ").trim();
  const parsed = Date.parse(cleaned);
  if (Number.isNaN(parsed)) return null;
  const event_date = new Date(parsed).toISOString().slice(0, 10);
  return isYmd(event_date) ? event_date : null;
}

function parseBlsReleaseTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const min = m[2];
  const pm = m[3].toUpperCase() === "PM";
  if (pm && hour !== 12) hour += 12;
  if (!pm && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${min}:00`;
}

function parseFedClockTime(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const min = m[2];
  const pm = m[3].replace(/\./g, "").toLowerCase().startsWith("p");
  if (pm && hour !== 12) hour += 12;
  if (!pm && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${min}:00`;
}

/** Parse BLS `release-list` tables — row-scoped names and dates only (no estimates). */
export function parseBlsReleaseScheduleHtml(html: string, from: string, to: string): EconomicEventUpsertRow[] {
  const rows: EconomicEventUpsertRow[] = [];
  const seen = new Set<string>();

  const tableRe = /<h2>\s*Schedule of Releases for the ([^<]+)<\/h2>[\s\S]*?<table class="release-list">([\s\S]*?)<\/table>/gi;
  let tableMatch: RegExpExecArray | null;
  while ((tableMatch = tableRe.exec(html)) !== null) {
    const releaseName = normalizeBlsReleaseTitle(tableMatch[1] ?? "");
    if (!releaseName) continue;
    const tableBody = tableMatch[2] ?? "";
    const rowRe = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(tableBody)) !== null) {
      const rowHtml = rowMatch[0];
      if (/<th/i.test(rowHtml)) continue;
      const cells = [...rowHtml.matchAll(/<td[^>]*>([^<]*)<\/td>/gi)].map((c) => c[1]?.trim() ?? "");
      if (cells.length < 2) continue;
      const event_date = parseBlsReleaseDate(cells[1]);
      if (!event_date || !inWindow(event_date, from, to)) continue;
      const event_time = cells.length >= 3 ? parseBlsReleaseTime(cells[2]) : null;
      const dedupe_key = `US|${releaseName.toLowerCase()}|${event_date}|`;
      if (seen.has(dedupe_key)) continue;
      seen.add(dedupe_key);
      rows.push({
        dedupe_key,
        event_name: releaseName,
        country: "US",
        event_date,
        event_time,
        importance: releaseName.includes("Employment") || releaseName.includes("Consumer Price") ? "high" : "medium",
        actual_value: null,
        consensus_estimate: null,
        previous_value: null,
        units: null,
        source: "U.S. Bureau of Labor Statistics",
        source_url: BLS_SCHEDULE_URL,
        provider: "us_government",
        description: "Scheduled release date from BLS public news release calendar.",
        actual_reported_at: null,
      });
    }
  }

  const calendarRowRe =
    /<tr[^>]*>\s*<td[^>]*>\s*((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+[^<]+)\s*<\/td>\s*<td[^>]*>\s*([^<]+)\s*<\/td>\s*<td[^>]*>\s*([^<]+)\s*<\/td>/gi;
  let calMatch: RegExpExecArray | null;
  while ((calMatch = calendarRowRe.exec(html)) !== null) {
    const event_date = parseBlsReleaseDate(calMatch[1]?.replace(/^[^,]+,\s*/, "") ?? calMatch[1] ?? "");
    const event_time = parseBlsReleaseTime(calMatch[2]);
    const releaseCell = calMatch[3]?.trim() ?? "";
    const releaseName = normalizeBlsReleaseTitle(releaseCell);
    if (!releaseName || !event_date || !inWindow(event_date, from, to)) continue;
    const dedupe_key = `US|${releaseName.toLowerCase()}|${event_date}|`;
    if (seen.has(dedupe_key)) continue;
    seen.add(dedupe_key);
    rows.push({
      dedupe_key,
      event_name: releaseName,
      country: "US",
      event_date,
      event_time,
      importance: releaseName.includes("Employment") || releaseName.includes("Consumer Price") ? "high" : "medium",
      actual_value: null,
      consensus_estimate: null,
      previous_value: null,
      units: null,
      source: "U.S. Bureau of Labor Statistics",
      source_url: BLS_SCHEDULE_URL,
      provider: "us_government",
      description: "Scheduled release date from BLS public news release calendar.",
      actual_reported_at: null,
    });
  }

  return rows;
}

function fedMonthlyPageYearMonth(html: string): { year: number; month: number } | null {
  const og = html.match(/<meta property="og:title" content="([^"]+)"/i)?.[1]?.trim();
  if (og) {
    const m = og.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (m) {
      const idx = FED_MONTH_SLUGS.findIndex((s) => s === m[1].toLowerCase());
      const year = Number(m[2]);
      if (idx >= 0 && Number.isFinite(year)) return { year, month: idx + 1 };
    }
  }
  const title = html.match(/<title>[^<]*Calendar:\s*([A-Za-z]+)\s+(\d{4})/i);
  if (title) {
    const idx = FED_MONTH_SLUGS.findIndex((s) => s === title[1].toLowerCase());
    const year = Number(title[2]);
    if (idx >= 0 && Number.isFinite(year)) return { year, month: idx + 1 };
  }
  return null;
}

/** Parse Federal Reserve monthly newsevents calendar for FOMC statement release (announcement day/time). */
export function parseFedMonthlyNewsEventsHtml(
  html: string,
  from: string,
  to: string,
  pageYear?: number,
  pageMonth?: number,
): EconomicEventUpsertRow[] {
  const scoped = fedMonthlyPageYearMonth(html);
  const year = pageYear ?? scoped?.year;
  const month = pageMonth ?? scoped?.month;
  if (!year || !month) return [];

  const sectionStart = html.search(/<h4[^>]*>\s*FOMC Meetings\s*<\/h4>/i);
  if (sectionStart < 0) return [];
  const rest = html.slice(sectionStart);
  const sectionEnd = rest.search(/<div class="row cal-nojs__rowTitle">/i);
  const section = sectionEnd > 0 ? rest.slice(0, sectionEnd) : rest.slice(0, 12000);

  const rows: EconomicEventUpsertRow[] = [];
  const seen = new Set<string>();
  const panels = section.split(/<div class="panel/i).slice(1);

  for (const panel of panels) {
    const timeRaw = panel.match(/col-xs-2[^>]*>\s*<p>([^<]+)<\/p>/i)?.[1]?.trim();
    const releaseDayRaw = panel.match(/col-xs-3[^>]*>\s*<p>(\d{1,2})<\/p>/i)?.[1]?.trim();
    const titleCol = panel.match(/col-xs-7[^>]*>([\s\S]*?)<\/div>\s*<div class="col-xs-3">/i)?.[1] ?? "";
    if (!/>\s*FOMC Meeting\s*</i.test(titleCol) && !/<p>\s*FOMC Meeting\s*<\/p>/i.test(titleCol)) {
      continue;
    }
    if (/FOMC Minutes/i.test(titleCol)) continue;
    if (!timeRaw || !releaseDayRaw) continue;
    const event_time = parseFedClockTime(timeRaw);
    if (!event_time) continue;
    const day = String(releaseDayRaw).padStart(2, "0");
    const monthStr = String(month).padStart(2, "0");
    const event_date = `${year}-${monthStr}-${day}`;
    if (!isYmd(event_date) || !inWindow(event_date, from, to)) continue;
    const dedupe_key = `US|fomc statement|${event_date}|`;
    if (seen.has(dedupe_key)) continue;
    seen.add(dedupe_key);
    const sourceUrl = `${FED_NEWSEVENTS_BASE}/${year}-${FED_MONTH_SLUGS[month - 1]}.htm`;
    rows.push({
      dedupe_key,
      event_name: "FOMC Statement",
      country: "US",
      event_date,
      event_time,
      importance: "high",
      actual_value: null,
      consensus_estimate: null,
      previous_value: null,
      units: null,
      source: "Board of Governors of the Federal Reserve System",
      source_url: sourceUrl,
      provider: "us_government",
      description: "FOMC policy statement release from Federal Reserve monthly events calendar.",
      actual_reported_at: null,
    });
  }

  return rows;
}

function monthsOverlappingWindow(from: string, to: string): { year: number; month: number; slug: string }[] {
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  const out: { year: number; month: number; slug: string }[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endCursor = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor <= endCursor) {
    const month = cursor.getUTCMonth();
    out.push({ year: cursor.getUTCFullYear(), month: month + 1, slug: FED_MONTH_SLUGS[month] });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

function finalizeIngestResult(
  rows: EconomicEventUpsertRow[],
  sourcesSucceeded: string[],
  sourcesFailed: string[],
  errors: string[],
): UsGovernmentIngestResult {
  const byKey = new Map<string, EconomicEventUpsertRow>();
  for (const row of rows) byKey.set(row.dedupe_key, row);
  const allSourcesFailed = sourcesSucceeded.length === 0;
  const partialCoverage = sourcesSucceeded.length > 0 && sourcesFailed.length > 0;
  return {
    rows: [...byKey.values()],
    sourcesSucceeded,
    sourcesFailed,
    errors,
    partialCoverage,
    allSourcesFailed,
  };
}

export async function fetchUsGovernmentEconomicReleases(
  from: string,
  to: string,
): Promise<UsGovernmentIngestResult> {
  const errors: string[] = [];
  const sourcesSucceeded: string[] = [];
  const sourcesFailed: string[] = [];
  const rows: EconomicEventUpsertRow[] = [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ECONOMIC_FETCH_TIMEOUT_MS);
  const headers = { "User-Agent": "StocksistEconomicSync/1.0 (calendar-v4; contact=stocksist.com)" };

  try {
    const blsRes = await fetch(BLS_SCHEDULE_URL, { signal: controller.signal, headers });
    if (blsRes.ok) {
      const html = await blsRes.text();
      const parsed = parseBlsReleaseScheduleHtml(html, from, to);
      rows.push(...parsed);
      sourcesSucceeded.push("bls_schedule");
    } else {
      errors.push(`bls_http_${blsRes.status}`);
      sourcesFailed.push("bls_schedule");
    }

    const months = monthsOverlappingWindow(from, to);
    const fedResults = await Promise.all(
      months.map(async ({ year, month, slug }) => {
        const url = `${FED_NEWSEVENTS_BASE}/${year}-${slug}.htm`;
        const res = await fetch(url, { signal: controller.signal, headers });
        return { url, year, month, res };
      }),
    );

    let fedOk = false;
    for (const { url, year, month, res } of fedResults) {
      if (!res.ok) {
        errors.push(`fed_http_${res.status}:${url}`);
        continue;
      }
      fedOk = true;
      const html = await res.text();
      rows.push(...parseFedMonthlyNewsEventsHtml(html, from, to, year, month));
    }
    if (fedOk) {
      sourcesSucceeded.push("federal_reserve_fomc");
    } else if (months.length > 0) {
      sourcesFailed.push("federal_reserve_fomc");
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "fetch_failed");
    if (!sourcesSucceeded.includes("bls_schedule") && !sourcesFailed.includes("bls_schedule")) {
      sourcesFailed.push("bls_schedule");
    }
    if (!sourcesSucceeded.includes("federal_reserve_fomc") && !sourcesFailed.includes("federal_reserve_fomc")) {
      sourcesFailed.push("federal_reserve_fomc");
    }
  } finally {
    clearTimeout(timer);
  }

  for (const key of US_GOV_SOURCE_KEYS) {
    if (!sourcesSucceeded.includes(key) && !sourcesFailed.includes(key)) {
      sourcesFailed.push(key);
      errors.push(`${key}_unavailable`);
    }
  }

  return finalizeIngestResult(rows, sourcesSucceeded, sourcesFailed, errors);
}

/** @deprecated Use parseFedMonthlyNewsEventsHtml — kept for regression comparison only. */
export function parseFedFomcCalendarHtml(html: string, from: string, to: string, year: number): EconomicEventUpsertRow[] {
  void html;
  void from;
  void to;
  void year;
  return [];
}