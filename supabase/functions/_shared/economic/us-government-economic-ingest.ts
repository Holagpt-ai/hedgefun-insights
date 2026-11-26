import type { EconomicEventUpsertRow } from "./finnhub-economic-calendar.ts";
import { ECONOMIC_FETCH_TIMEOUT_MS } from "./finnhub-economic-calendar.ts";

const BLS_SCHEDULE_URL = "https://www.bls.gov/schedule/news_release/current_year.htm";
const FOMC_CALENDAR_URL = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";

function isYmd(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function inWindow(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

/** Parse BLS release schedule HTML — names + calendar dates only (no estimates). */
export function parseBlsReleaseScheduleHtml(html: string, from: string, to: string): EconomicEventUpsertRow[] {
  const rows: EconomicEventUpsertRow[] = [];
  const re =
    /(?:<td[^>]*>\s*)?((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4})[^<]*(?:<\/td>)?[\s\S]{0,400}?((?:Consumer Price Index|Employment Situation|Producer Price Index|Import and Export|Job Openings|Real Earnings)[^<]{0,80})/gi;

  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(html)) !== null) {
    const dateRaw = m[1]?.trim();
    const title = m[2]?.trim();
    if (!dateRaw || !title) continue;
    const parsed = Date.parse(dateRaw);
    if (Number.isNaN(parsed)) continue;
    const event_date = new Date(parsed).toISOString().slice(0, 10);
    if (!isYmd(event_date) || !inWindow(event_date, from, to)) continue;
    const dedupe_key = `US|${title.toLowerCase()}|${event_date}|`;
    if (seen.has(dedupe_key)) continue;
    seen.add(dedupe_key);
    rows.push({
      dedupe_key,
      event_name: title.replace(/\s+/g, " "),
      country: "US",
      event_date,
      event_time: null,
      importance: title.includes("Employment") || title.includes("Consumer Price") ? "high" : "medium",
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
  if (rows.length === 0) {
    const dateRe = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/gi;
    let d: RegExpExecArray | null;
    while ((d = dateRe.exec(html)) !== null) {
      const event_date = new Date(d[0]).toISOString().slice(0, 10);
      if (!inWindow(event_date, from, to)) continue;
      const slice = html.slice(d.index, d.index + 600);
      const titleMatch = slice.match(
        /(Consumer Price Index|Employment Situation|Producer Price Index|Import and Export Price Indexes)/i,
      );
      if (!titleMatch) continue;
      const title = titleMatch[1];
      const dedupe_key = `US|${title.toLowerCase()}|${event_date}|`;
      if (seen.has(dedupe_key)) continue;
      seen.add(dedupe_key);
      rows.push({
        dedupe_key,
        event_name: title,
        country: "US",
        event_date,
        event_time: null,
        importance: title.includes("Employment") || title.includes("Consumer Price") ? "high" : "medium",
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

  return rows;
}

/** Parse Federal Reserve FOMC meeting calendar — meeting start dates in range. */
export function parseFedFomcCalendarHtml(html: string, from: string, to: string, year: number): EconomicEventUpsertRow[] {
  const rows: EconomicEventUpsertRow[] = [];
  const monthMap: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
    july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
  };
  const re = new RegExp(
    String.raw`(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:\s*[-–]\s*\d{1,2})?`,
    "gi",
  );
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(html)) !== null) {
    const month = monthMap[m[1].toLowerCase()];
    if (!month) continue;
    const day = String(m[2]).padStart(2, "0");
    const event_date = `${year}-${month}-${day}`;
    if (!inWindow(event_date, from, to)) continue;
    const dedupe_key = `US|fomc statement|${event_date}|`;
    if (seen.has(dedupe_key)) continue;
    seen.add(dedupe_key);
    rows.push({
      dedupe_key,
      event_name: "FOMC Statement",
      country: "US",
      event_date,
      event_time: "14:00:00",
      importance: "high",
      actual_value: null,
      consensus_estimate: null,
      previous_value: null,
      units: null,
      source: "Board of Governors of the Federal Reserve System",
      source_url: FOMC_CALENDAR_URL,
      provider: "us_government",
      description: "FOMC meeting date from Federal Reserve public calendar.",
      actual_reported_at: null,
    });
  }
  return rows;
}

export async function fetchUsGovernmentEconomicReleases(
  from: string,
  to: string,
): Promise<{ rows: EconomicEventUpsertRow[]; sources: string[]; errors: string[] }> {
  const errors: string[] = [];
  const sources: string[] = [];
  const rows: EconomicEventUpsertRow[] = [];
  const year = Number(from.slice(0, 4));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ECONOMIC_FETCH_TIMEOUT_MS);

  try {
    const [blsRes, fedRes] = await Promise.all([
      fetch(BLS_SCHEDULE_URL, {
        signal: controller.signal,
        headers: { "User-Agent": "StocksistEconomicSync/1.0 (calendar-v4; contact=stocksist.com)" },
      }),
      fetch(FOMC_CALENDAR_URL, {
        signal: controller.signal,
        headers: { "User-Agent": "StocksistEconomicSync/1.0 (calendar-v4; contact=stocksist.com)" },
      }),
    ]);

    if (blsRes.ok) {
      const html = await blsRes.text();
      rows.push(...parseBlsReleaseScheduleHtml(html, from, to));
      sources.push("bls_schedule");
    } else {
      errors.push(`bls_http_${blsRes.status}`);
    }

    if (fedRes.ok) {
      const html = await fedRes.text();
      rows.push(...parseFedFomcCalendarHtml(html, from, to, year));
      if (year + 1 <= Number(to.slice(0, 4))) {
        rows.push(...parseFedFomcCalendarHtml(html, from, to, year + 1));
      }
      sources.push("federal_reserve_fomc");
    } else {
      errors.push(`fed_http_${fedRes.status}`);
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "fetch_failed");
  } finally {
    clearTimeout(timer);
  }

  const byKey = new Map<string, EconomicEventUpsertRow>();
  for (const row of rows) byKey.set(row.dedupe_key, row);

  return { rows: [...byKey.values()], sources, errors };
}