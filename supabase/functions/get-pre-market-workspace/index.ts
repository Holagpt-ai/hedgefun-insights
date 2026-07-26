import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  CONTRACT_VERSION,
  INDEX_STALE_MINUTES,
  SCREENER_STALE_MINUTES,
  ageMinutes,
  buildChecklist,
  
  dedupeCatalyst,
  derivedSectionStatus,
  emptySection,
  envelope,
  etDateShift,
  etParts,
  etTimeLabel,
  finiteOrNull,
  isActiveSession,
  isCurrentPremarketAnalysis,
  isHttpsUrl,
  isIsoDate,
  isProviderReported,
  isoOrNull,
  latestRequestByTicker,
  lifecycleLabel,
  missingSymbols,
  normalizeDirection,
  normalizeRequestStatus,
  normalizeSide,
  normalizeSymbol,
  normalizeTimeOfDay,
  positiveOrNull,
  resolveMarketContext,
  sanitizeAlerts,
  sanitizeMarketSignals,
  selectVolumeLeaders,
  sortByVolumeDesc,

  unavailableSection,
  type PreMarketSignal,
  type RequestState,
  type SectionEnvelope,
} from "../_shared/pre-market/contract.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
  "Cache-Control": "private, no-store",
};

const INDEX_SYMBOLS = ["SPY", "QQQ", "DIA", "IWM"] as const;
const VOLUME_LEADER_LIMIT = 6;
const HEADLINE_LIMIT = 8;
/** Catalyst/earnings window: today plus the previous two ET calendar dates. */
const CATALYST_LOOKBACK_DAYS = 2;
const ALERT_LOOKBACK_HOURS = 24;
const PROVIDER_TIMEOUT_MS = 4_000;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

// ---- bounded provider fetches (fail closed, never swallowed) -------------
const NOW_TTL_MS = 60_000;
const UPCOMING_TTL_MS = 15 * 60_000;
let nowCache: { at: number; body: unknown } | null = null;
let upcomingCache: { at: number; body: unknown } | null = null;

async function fetchJsonBounded(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error("provider_non_ok");
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMarketNow(apiKey: string): Promise<unknown> {
  if (nowCache && Date.now() - nowCache.at <= NOW_TTL_MS) return nowCache.body;
  const body = await fetchJsonBounded(`https://api.polygon.io/v1/marketstatus/now?apiKey=${apiKey}`);
  nowCache = { at: Date.now(), body };
  return body;
}

async function fetchUpcoming(apiKey: string): Promise<unknown> {
  if (upcomingCache && Date.now() - upcomingCache.at <= UPCOMING_TTL_MS) return upcomingCache.body;
  const body = await fetchJsonBounded(`https://api.polygon.io/v1/marketstatus/upcoming?apiKey=${apiKey}`);
  if (!Array.isArray(body)) throw new Error("upcoming_malformed");
  upcomingCache = { at: Date.now(), body };
  return body;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !anonKey) {
    console.error("get-pre-market-workspace: server_misconfigured");
    return json({ error: "SERVER_MISCONFIGURED" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+.+/i.test(authHeader)) return json({ error: "UNAUTHORIZED" }, 401);

  // User-scoped client: every ownership-bearing read goes through RLS.
  // No user_id is ever accepted from the request body.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user?.id) return json({ error: "UNAUTHORIZED" }, 401);
  const userId = userData.user.id;

  const now = new Date();
  const nowMs = now.getTime();
  const et = etParts(now);

  // ---------------------------------------------------------- market context
  // Fail closed: both provider requests must succeed and validate.
  let ctx = {
    status: "unavailable" as const,
    reason_code: "CALENDAR_UNAVAILABLE" as string | null,
    source: null as "polygon_marketstatus" | null,
    official_open_at: null as string | null,
    official_close_at: null as string | null,
    next_known_session_at: null as string | null,
  } as ReturnType<typeof resolveMarketContext>;

  const polygonKey = Deno.env.get("POLYGON_API_KEY");
  if (polygonKey) {
    let nowBody: unknown = null;
    let calendarBody: unknown = null;
    let providerOk = true;
    try {
      [nowBody, calendarBody] = await Promise.all([
        fetchMarketNow(polygonKey),
        fetchUpcoming(polygonKey),
      ]);
    } catch (_e) {
      providerOk = false;
      console.error("get-pre-market-workspace: market calendar request failed");
    }
    if (providerOk) {
      ctx = resolveMarketContext({
        nowBody,
        calendarBody,
        etDate: et.date,
        etWeekday: et.weekday,
        nowMs,
      });
    }
  }

  const marketStatus = ctx.status;
  const active = isActiveSession(marketStatus);
  const inPremarket = marketStatus === "premarket";

  // ------------------------------------------------------------- section IO
  const catalystFrom = etDateShift(et.date, -CATALYST_LOOKBACK_DAYS);
  const results = await Promise.allSettled([
    userClient.from("market_indexes")
      .select("symbol, name, current_value, change_amount, change_percent, updated_at")
      .in("symbol", INDEX_SYMBOLS as unknown as string[]),
    userClient.from("watchlists").select("symbol").eq("user_id", userId),
    userClient.from("catalyst_events")
      .select("id, dedupe_key, symbol, company_name, provider, event_type, verification_state, event_date, event_time, time_of_day, title, source_name, source_url, published_at, updated_at, facts")
      .eq("verification_state", "provider_reported")
      .gte("event_date", catalystFrom)
      .lte("event_date", et.date)
      .order("event_date", { ascending: false })
      .limit(400),
    userClient.from("screener_results")
      .select("symbol, company_name, price, change_percent, volume, rvol, updated_at")
      .eq("tab_id", "day_trade_radar")
      .order("volume", { ascending: false, nullsFirst: false })
      .limit(VOLUME_LEADER_LIMIT * 4),
    userClient.from("journal_trades")
      .select("id, symbol, side, qty, entry_price, stop_price, target_price, status")
      .eq("user_id", userId)
      .eq("status", "open"),
    userClient.from("market_news")
      .select("id, headline, source, url, published_at")
      .order("published_at", { ascending: false })
      .limit(HEADLINE_LIMIT * 2),
  ]);

  const [idxRes, wlRes, catRes, scrRes, jrnRes, newsRes] = results;

  const ok = <T,>(r: PromiseSettledResult<{ data: T | null; error: unknown }>): T | null =>
    r.status === "fulfilled" && !r.value.error ? (r.value.data ?? ([] as unknown as T)) : null;

  // ------------------------------------------------------------- 1. indexes
  interface IndexOut {
    symbol: string;
    status: "available" | "unavailable";
    name: string | null;
    value: number | null;
    change_percent: number | null;
    change_amount: number | null;
    updated_at: string | null;
    stale: boolean;
  }
  let indexes: SectionEnvelope<IndexOut[]>;
  {
    const raw = ok<Array<Record<string, unknown>>>(idxRes as never);
    if (raw === null) {
      indexes = unavailableSection<IndexOut[]>([], "QUERY_FAILED");
    } else {
      const valid = new Map<string, IndexOut>();
      for (const r of raw) {
        const symbol = normalizeSymbol(r.symbol);
        const value = positiveOrNull(r.current_value);
        const cp = finiteOrNull(r.change_percent);
        const ts = isoOrNull(r.updated_at);
        if (!symbol || value === null || cp === null || !ts) continue;
        const age = ageMinutes(ts, nowMs) ?? Infinity;
        valid.set(symbol, {
          symbol,
          status: "available",
          name: typeof r.name === "string" ? r.name : null,
          value,
          change_percent: cp,
          change_amount: finiteOrNull(r.change_amount),
          updated_at: ts,
          stale: active && age > INDEX_STALE_MINUTES,
        });
      }
      // Always account for every expected index symbol.
      const rows: IndexOut[] = INDEX_SYMBOLS.map((s) =>
        valid.get(s) ?? {
          symbol: s,
          status: "unavailable" as const,
          name: null,
          value: null,
          change_percent: null,
          change_amount: null,
          updated_at: null,
          stale: false,
        }
      );
      const missing = missingSymbols(INDEX_SYMBOLS, valid.keys());
      const newest = rows.reduce<string | null>(
        (acc, r) => (r.updated_at && (!acc || r.updated_at > acc) ? r.updated_at : acc),
        null,
      );
      const anyStale = rows.some((r) => r.stale);
      indexes = valid.size === 0
        ? unavailableSection<IndexOut[]>(rows, "NO_QUALIFYING_DATA")
        : envelope(
          anyStale ? "stale" : "available",
          rows,
          newest,
          anyStale ? "SOURCE_STALE" : missing.length > 0 ? "INCOMPLETE_COVERAGE" : null,
        );
    }
  }

  // -------------------------------------------------- 2. watchlist activity
  const wlRaw = ok<Array<Record<string, unknown>>>(wlRes as never);
  const symbols = (wlRaw ?? [])
    .map((r) => normalizeSymbol(r.symbol))
    .filter((s): s is string => !!s);
  const ownedSet = new Set(symbols);

  interface WlOut {
    ticker: string; company_name: string | null; direction: string;
    explanation: string; failure_reason: string | null;
    price: number | null; change_pct: number | null; volume: number | null;
    rvol: number | null; rvol_class: string | null;
    market_signals: PreMarketSignal[]; session_date: string | null; analyzed_at: string | null;
    valid_through: string | null; awaiting_refresh: boolean;
    request_status: string | null;
  }
  let watchlist_activity: SectionEnvelope<WlOut[]>;
  let awaitingRefreshCount = 0;
  let pendingCount = 0;
  let failedCount = 0;
  let alertsOk = false;
  let alerts: ReturnType<typeof sanitizeAlerts> = [];
  const lifecycle: Array<{ ticker: string; label: string }> = [];

  if (marketStatus === "unavailable") {
    // The session itself is unknown — we cannot claim "no pre-market activity".
    watchlist_activity = unavailableSection<WlOut[]>(
      [],
      (ctx.reason_code as never) ?? "CALENDAR_UNAVAILABLE",
    );
  } else if (wlRaw === null) {
    watchlist_activity = unavailableSection<WlOut[]>([], "QUERY_FAILED");

  } else if (symbols.length === 0) {
    watchlist_activity = emptySection<WlOut[]>([], "WATCHLIST_EMPTY");
    alertsOk = true;
  } else {
    const alertSince = new Date(nowMs - ALERT_LOOKBACK_HOURS * 3600_000).toISOString();
    const [aRes, nRes, rRes, alRes] = await Promise.allSettled([
      userClient.from("watchlist_analysis_v2").select("*").in("ticker", symbols),
      userClient.from("ticker_search").select("symbol, name").in("symbol", symbols),
      userClient.from("watchlist_analysis_requests")
        .select("ticker, status, requested_at, error_code")
        .eq("user_id", userId)
        .in("ticker", symbols)
        .order("requested_at", { ascending: false })
        .limit(400),

      userClient.from("watchlist_alerts_v2")
        .select("ticker, alert_type, reason, event_time, session_date, dedupe_key")
        .in("ticker", symbols)
        .gte("event_time", alertSince)
        .order("event_time", { ascending: false })
        .limit(100),
    ]);
    const analysis = ok<Array<Record<string, unknown>>>(aRes as never);
    const names = ok<Array<Record<string, unknown>>>(nRes as never) ?? [];
    const requestsRaw = ok<Array<Record<string, unknown>>>(rRes as never);
    const alertsRaw = ok<Array<Record<string, unknown>>>(alRes as never);

    alertsOk = alertsRaw !== null;
    if (alertsRaw) alerts = sanitizeAlerts(alertsRaw, ownedSet);

    const nameMap: Record<string, string> = {};
    for (const n of names) {
      const s = normalizeSymbol(n.symbol);
      if (s && typeof n.name === "string") nameMap[s] = n.name;
    }

    const requestsFailed = requestsRaw === null;
    const requestStates: Map<string, RequestState> = latestRequestByTicker(requestsRaw ?? []);

    if (analysis === null || requestsFailed) {
      watchlist_activity = unavailableSection<WlOut[]>([], "QUERY_FAILED");
    } else {
      const byTicker = new Map<string, Record<string, unknown>>();
      for (const a of analysis) {
        const t = normalizeSymbol(a.ticker);
        if (t) byTicker.set(t, a);
      }
      const current: WlOut[] = [];
      for (const sym of symbols) {
        const a = byTicker.get(sym);
        const state = requestStates.get(sym);
        // Pre-Market rows may only be presented as current during pre-market.
        const isCurrent = inPremarket && !!a && isCurrentPremarketAnalysis(a, et.date, nowMs);
        if (!isCurrent) {
          lifecycle.push({ ticker: sym, label: lifecycleLabel(state) });
          if (state?.status === "pending") pendingCount += 1;
          else if (state?.status === "failed") failedCount += 1;
          else if (inPremarket) awaitingRefreshCount += 1;
          continue;
        }
        const direction = normalizeDirection(a!.direction);
        const unavailable = direction === "data_unavailable";
        current.push({
          ticker: sym,
          company_name: nameMap[sym] ?? null,
          direction,
          explanation: typeof a!.explanation === "string" ? a!.explanation : "",
          failure_reason: unavailable
            ? (typeof a!.failure_reason === "string" ? a!.failure_reason : "Analysis could not be validated")
            : null,
          price: positiveOrNull(a!.price),
          change_pct: finiteOrNull(a!.change_pct),
          volume: positiveOrNull(a!.volume),
          rvol: finiteOrNull(a!.rvol),
          rvol_class: typeof a!.rvol_class === "string" ? a!.rvol_class : null,
          market_signals: sanitizeMarketSignals(a!.market_signals, { unavailable }),
          session_date: isIsoDate(a!.session_date) ? a!.session_date : null,
          analyzed_at: isoOrNull(a!.analyzed_at),
          valid_through: isoOrNull(a!.valid_through),
          awaiting_refresh: false,
          request_status: normalizeRequestStatus(state?.status) ?? null,
        });
      }
      const sorted = sortByVolumeDesc(current);
      const newest = sorted.reduce<string | null>(
        (acc, r) => (r.analyzed_at && (!acc || r.analyzed_at > acc) ? r.analyzed_at : acc),
        null,
      );
      // `empty` here always means a CONFIRMED outside-pre-market or
      // non-trading state — an unknown session already failed closed above.
      watchlist_activity = sorted.length === 0
        ? emptySection<WlOut[]>(
          [],
          !inPremarket
            ? (marketStatus === "non_trading_day" ? "NON_TRADING_DAY" : "OUTSIDE_PREMARKET")
            : "ANALYSIS_AWAITING_REFRESH",
        )

        : envelope("available", sorted, newest, null);
    }
  }

  // ------------------------------------------------------------- 3. catalyst
  interface CatOut {
    id: string; symbol: string; company_name: string | null; event_type: string;
    event_date: string; event_time: string | null; time_of_day: string | null;
    title: string; source_name: string | null; source_url: string | null;
    published_at: string | null; updated_at: string | null; facts: unknown;
  }
  const catRaw = ok<Array<Record<string, unknown>>>(catRes as never);
  const catalystRows: CatOut[] = [];
  let catalyst_watch: SectionEnvelope<CatOut[]>;
  const newestSourceTs = (rows: CatOut[]): string | null =>
    rows.reduce<string | null>((acc, r) => {
      const ts = r.updated_at ?? r.published_at;
      return ts && (!acc || ts > acc) ? ts : acc;
    }, null);

  if (catRaw === null) {
    catalyst_watch = unavailableSection<CatOut[]>([], "QUERY_FAILED");
  } else {
    for (const r of dedupeCatalyst(catRaw)) {
      if (!isProviderReported(r)) continue;
      const symbol = normalizeSymbol(r.symbol);
      const title = typeof r.title === "string" ? r.title.trim() : "";
      if (!symbol || !title || !isIsoDate(r.event_date)) continue;
      // ET calendar window only — today and the previous two ET dates.
      if (r.event_date < catalystFrom || r.event_date > et.date) continue;
      const updated = isoOrNull(r.updated_at);
      const published = isoOrNull(r.published_at);
      if (!updated && !published) continue; // untimestamped events are excluded
      catalystRows.push({
        id: String(r.id),
        symbol,
        company_name: typeof r.company_name === "string" ? r.company_name : null,
        event_type: typeof r.event_type === "string" ? r.event_type : "company_news",
        event_date: r.event_date as string,
        event_time: isoOrNull(r.event_time),
        time_of_day: normalizeTimeOfDay(r.time_of_day),
        title,
        source_name: typeof r.source_name === "string" ? r.source_name : null,
        source_url: isHttpsUrl(r.source_url) ? r.source_url : null,
        published_at: published,
        updated_at: updated,
        facts: r.facts ?? null,
      });
    }
    const scored = [...catalystRows]
      .sort((a, b) => {
        const aw = ownedSet.has(a.symbol) ? 0 : 1;
        const bw = ownedSet.has(b.symbol) ? 0 : 1;
        if (aw !== bw) return aw - bw;
        const at = a.event_date === et.date ? 0 : 1;
        const bt = b.event_date === et.date ? 0 : 1;
        if (at !== bt) return at - bt;
        return b.event_date.localeCompare(a.event_date);
      })
      .slice(0, 12);
    catalyst_watch = scored.length === 0
      ? emptySection<CatOut[]>([], "NO_QUALIFYING_DATA")
      : envelope("available", scored, newestSourceTs(scored), null);
  }

  // ------------------------------------------------------------- 4. earnings
  interface EarnOut {
    id: string; symbol: string; company_name: string | null; event_date: string;
    time_of_day: string | null; title: string; eps_estimate: number | null;
    eps_actual: number | null; source_name: string | null; source_url: string | null;
  }
  let earnings: SectionEnvelope<EarnOut[]>;
  let beforeOpenCount = 0;
  if (catRaw === null) {
    earnings = unavailableSection<EarnOut[]>([], "QUERY_FAILED");
  } else {
    const todays = catalystRows.filter((c) => c.event_type === "earnings" && c.event_date === et.date);
    const source = todays.filter((c) => c.time_of_day === "before_open" || c.time_of_day === null);
    const out: EarnOut[] = source.map((c) => {
      const facts = (c.facts && typeof c.facts === "object" ? c.facts : {}) as Record<string, unknown>;
      return {
        id: c.id,
        symbol: c.symbol,
        company_name: c.company_name,
        event_date: c.event_date,
        time_of_day: c.time_of_day,
        title: c.title,
        eps_estimate: finiteOrNull(facts.eps_estimate),
        eps_actual: finiteOrNull(facts.eps_actual),
        source_name: c.source_name,
        source_url: c.source_url,
      };
    });
    beforeOpenCount = out.filter((e) => e.time_of_day === "before_open").length;
    earnings = out.length === 0
      ? emptySection<EarnOut[]>([], "NO_QUALIFYING_DATA")
      : envelope("available", out, newestSourceTs(source), null);
  }

  // -------------------------------------------------------- 5. volume leaders
  interface VolOut {
    symbol: string; company_name: string | null; price: number | null;
    change_percent: number | null; volume: number | null; rvol: number | null;
    updated_at: string | null;
  }
  const scrRaw = ok<Array<Record<string, unknown>>>(scrRes as never);
  let volume_leaders: SectionEnvelope<VolOut[]>;
  if (scrRaw === null) {
    volume_leaders = unavailableSection<VolOut[]>([], "QUERY_FAILED");
  } else {
    // Positive-volume candidates are tracked separately from invalid-volume
    // rows so an unusable row's timestamp can never vouch for a usable row.
    let positiveVolumeCandidates = 0;
    const candidates: VolOut[] = [];
    for (const r of scrRaw) {
      const symbol = normalizeSymbol(r.symbol);
      const volume = positiveOrNull(r.volume);
      if (!symbol || volume === null) continue;
      positiveVolumeCandidates += 1;
      const updated = isoOrNull(r.updated_at);
      if (!updated) continue; // no own freshness → never displayed
      candidates.push({
        symbol,
        company_name: typeof r.company_name === "string" ? r.company_name : null,
        price: positiveOrNull(r.price),
        change_percent: finiteOrNull(r.change_percent),
        volume,
        rvol: finiteOrNull(r.rvol),
        updated_at: updated,
      });
    }
    const verdict = selectVolumeLeaders(candidates, {
      positiveVolumeCandidates,
      limit: VOLUME_LEADER_LIMIT,
      nowMs,
      active,
      staleMinutes: SCREENER_STALE_MINUTES,
    });
    volume_leaders = envelope(verdict.status, verdict.rows, verdict.as_of, verdict.reason_code);
  }

  // ------------------------------------------------------ 6. journal readiness
  interface JournalReadiness {
    open_trades: number; missing_stop: number; missing_target: number;
    symbols: Array<{ symbol: string; side: string; qty: number | null; missing_stop: boolean; missing_target: boolean }>;
  }
  const EMPTY_JOURNAL: JournalReadiness = { open_trades: 0, missing_stop: 0, missing_target: 0, symbols: [] };
  const jrnRaw = ok<Array<Record<string, unknown>>>(jrnRes as never);
  let journal_readiness: SectionEnvelope<JournalReadiness>;
  let journalMissingRiskCount = 0;
  if (jrnRaw === null) {
    journal_readiness = unavailableSection<JournalReadiness>(EMPTY_JOURNAL, "QUERY_FAILED");
  } else {
    let malformed = 0;
    const rows = jrnRaw
      .map((r) => {
        const symbol = normalizeSymbol(r.symbol);
        const side = normalizeSide(r.side);
        // Never coerce an invalid or missing side into "long".
        if (!symbol || side === null) {
          malformed += 1;
          return null;
        }
        return {
          symbol,
          side,
          qty: positiveOrNull(r.qty),
          missing_stop: positiveOrNull(r.stop_price) === null,
          missing_target: positiveOrNull(r.target_price) === null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (malformed > 0) {
      // Coverage is incomplete — never undercount open risk silently.
      journal_readiness = unavailableSection<JournalReadiness>(EMPTY_JOURNAL, "INCOMPLETE_COVERAGE");
    } else {
      const data: JournalReadiness = {
        open_trades: rows.length,
        missing_stop: rows.filter((r) => r.missing_stop).length,
        missing_target: rows.filter((r) => r.missing_target).length,
        symbols: rows,
      };
      journalMissingRiskCount = rows.filter((r) => r.missing_stop || r.missing_target).length;
      journal_readiness = rows.length === 0
        ? envelope("empty", data, null, "NO_QUALIFYING_DATA")
        : envelope("available", data, null, null);
    }
  }


  // ------------------------------------------------------------ 7. headlines
  interface NewsOut { id: string; headline: string; source: string | null; url: string | null; published_at: string }
  const newsRaw = ok<Array<Record<string, unknown>>>(newsRes as never);
  let headlines: SectionEnvelope<NewsOut[]>;
  if (newsRaw === null) {
    headlines = unavailableSection<NewsOut[]>([], "QUERY_FAILED");
  } else {
    const seen = new Set<string>();
    const rows: NewsOut[] = [];
    for (const r of newsRaw) {
      const headline = typeof r.headline === "string" ? r.headline.trim() : "";
      const published = isoOrNull(r.published_at);
      if (!headline || !published) continue;
      const url = isHttpsUrl(r.url) ? r.url : null;
      const key = url ?? String(r.id ?? headline);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ id: String(r.id ?? key), headline, source: typeof r.source === "string" ? r.source : null, url, published_at: published });
      if (rows.length >= HEADLINE_LIMIT) break;
    }
    const newest = rows[0]?.published_at ?? null;
    headlines = rows.length === 0
      ? emptySection<NewsOut[]>([], "NEWS_FEED_EMPTY")
      : envelope("available", rows, newest, null);
  }

  // ------------------------------------------------------ 8. risk & attention
  interface AttentionItem { id: string; symbol: string | null; kind: string; label: string; detail: string | null; route: string | null }
  const wlRoute = (s: string) => `/dashboard/watchlist?symbol=${encodeURIComponent(s)}`;
  const attention: AttentionItem[] = [];
  {
    for (const row of watchlist_activity.data as WlOut[]) {
      if (row.direction === "data_unavailable") {
        attention.push({ id: `unavail:${row.ticker}`, symbol: row.ticker, kind: "data_unavailable", label: "Data unavailable", detail: row.failure_reason, route: wlRoute(row.ticker) });
        continue;
      }
      for (const s of row.market_signals) {
        if (s.direction === "bearish" || s.direction === "bullish") {
          attention.push({
            id: `sig:${row.ticker}:${s.signal_id}`,
            symbol: row.ticker,
            kind: s.direction === "bearish" ? "bearish_signal" : "bullish_signal",
            label: s.direction === "bearish" ? "Bearish market signal" : "Bullish market signal",
            detail: s.label,
            route: wlRoute(row.ticker),
          });
        }
      }
      if (row.rvol_class === "unusual" || row.rvol_class === "extreme") {
        attention.push({ id: `rvol:${row.ticker}`, symbol: row.ticker, kind: "unusual_volume", label: "Unusual time-adjusted volume", detail: row.rvol !== null ? `RVOL ${row.rvol.toFixed(2)}` : null, route: wlRoute(row.ticker) });
      }
    }
    for (const a of alerts) {
      attention.push({ id: `alert:${a.dedupe_key}`, symbol: a.ticker, kind: `alert_${a.alert_type}`, label: "Watchlist alert", detail: a.reason, route: wlRoute(a.ticker) });
    }
    if (pendingCount > 0) {
      attention.push({ id: "requests_pending", symbol: null, kind: "analysis_pending", label: "Analysis pending", detail: `${pendingCount} watchlist ${pendingCount === 1 ? "symbol has" : "symbols have"} an in-flight analysis request`, route: "/dashboard/watchlist" });
    }
    if (failedCount > 0) {
      attention.push({ id: "requests_failed", symbol: null, kind: "analysis_failed", label: "Analysis request failed", detail: `${failedCount} watchlist ${failedCount === 1 ? "symbol's" : "symbols'"} last analysis request failed`, route: "/dashboard/watchlist" });
    }
    if (awaitingRefreshCount > 0 && watchlist_activity.status !== "unavailable") {
      attention.push({ id: "awaiting_refresh", symbol: null, kind: "awaiting_refresh", label: "Analysis awaiting refresh", detail: `${awaitingRefreshCount} watchlist ${awaitingRefreshCount === 1 ? "symbol has" : "symbols have"} no current pre-market analysis`, route: "/dashboard/watchlist" });
    }
    for (const c of catalystRows) {
      if (c.event_type === "earnings" && c.event_date === et.date && ownedSet.has(c.symbol)) {
        attention.push({ id: `earn:${c.id}`, symbol: c.symbol, kind: "earnings_today", label: "Earnings today", detail: c.title, route: `/dashboard/catalyst?symbol=${encodeURIComponent(c.symbol)}` });
      }
    }
    for (const t of (journal_readiness.data as JournalReadiness).symbols) {
      if (t.missing_stop || t.missing_target) {
        const missing = [t.missing_stop ? "stop" : null, t.missing_target ? "target" : null].filter(Boolean).join(" and ");
        attention.push({ id: `jrnl:${t.symbol}:${missing}`, symbol: t.symbol, kind: "journal_risk_missing", label: "Journal risk level missing", detail: `Open ${t.side} trade has no recorded ${missing}`, route: `/dashboard/journal?symbol=${encodeURIComponent(t.symbol)}` });
      }
    }
  }

  // A derived section may only claim available/empty when every required input succeeded.
  const derivedInputsComplete =
    watchlist_activity.status !== "unavailable" &&
    journal_readiness.status !== "unavailable" &&
    catalyst_watch.status !== "unavailable" &&
    alertsOk;

  const riskVerdict = derivedSectionStatus(derivedInputsComplete, attention.length);
  const risk_attention: SectionEnvelope<AttentionItem[]> = envelope(
    riskVerdict.status,
    riskVerdict.status === "unavailable" ? [] : attention,
    riskVerdict.status === "available" ? now.toISOString() : null,
    riskVerdict.reason_code,
  );

  // ------------------------------------------------------------- 9. checklist
  const checklistInputsComplete =
    derivedInputsComplete && volume_leaders.status !== "unavailable" && indexes.status !== "unavailable";
  const checklistItems = checklistInputsComplete
    ? buildChecklist({
      watchlistPremarketCount: (watchlist_activity.data as WlOut[]).length,
      catalystTodayCount: catalystRows.filter((c) => c.event_date === et.date).length,
      beforeOpenEarningsCount: beforeOpenCount,
      awaitingRefreshCount,
      journalMissingRiskCount,
      volumeLeaderCount: (volume_leaders.data as VolOut[]).length,
    })
    : [];
  const checklistVerdict = derivedSectionStatus(checklistInputsComplete, checklistItems.length);
  const checklist = envelope(
    checklistVerdict.status,
    checklistItems,
    checklistVerdict.status === "available" ? now.toISOString() : null,
    checklistVerdict.reason_code,
  );

  return json({
    contract_version: CONTRACT_VERSION,
    server_now: now.toISOString(),
    market_context: {
      status: marketStatus,
      et_date: et.date,
      et_time: etTimeLabel(et),
      checked_at: now.toISOString(),
      source: ctx.source,
      reason_code: ctx.reason_code,
      official_open_at: ctx.official_open_at,
      official_close_at: ctx.official_close_at,
      next_known_session_at: ctx.next_known_session_at,
    },
    watchlist_lifecycle: lifecycle,
    alerts_included: alertsOk,
    indexes,
    watchlist_activity,
    risk_attention,
    catalyst_watch,
    earnings,
    volume_leaders,
    journal_readiness,
    headlines,
    checklist,
  }, 200);
});
