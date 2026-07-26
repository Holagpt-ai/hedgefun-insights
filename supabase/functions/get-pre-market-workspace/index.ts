import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  CONTRACT_VERSION,
  INDEX_STALE_MINUTES,
  SCREENER_STALE_MINUTES,
  ageMinutes,
  buildChecklist,
  dedupeCatalyst,
  emptySection,
  envelope,
  etParts,
  etTimeLabel,
  finiteOrNull,
  isActiveSession,
  isCurrentPremarketAnalysis,
  isHttpsUrl,
  isIsoDate,
  isProviderReported,
  isWeekend,
  isoOrNull,
  mapMarketStatus,
  normalizeSymbol,
  normalizeTimeOfDay,
  positiveOrNull,
  sortByVolumeDesc,
  unavailableSection,
  type MarketContextStatus,
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

const INDEX_SYMBOLS = ["SPY", "QQQ", "DIA", "IWM"];
const VOLUME_LEADER_LIMIT = 6;
const HEADLINE_LIMIT = 8;
const CATALYST_RECENT_HOURS = 48;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

// ---- in-process market status cache -----------------------------------
const NOW_TTL_MS = 60_000;
const UPCOMING_TTL_MS = 15 * 60_000;
let nowCache: { at: number; body: unknown } | null = null;
let upcomingCache: { at: number; rows: Array<Record<string, unknown>> } | null = null;

async function fetchMarketNow(apiKey: string): Promise<unknown> {
  if (nowCache && Date.now() - nowCache.at <= NOW_TTL_MS) return nowCache.body;
  const res = await fetch(`https://api.polygon.io/v1/marketstatus/now?apiKey=${apiKey}`);
  if (!res.ok) throw new Error("status_non_ok");
  const body = await res.json();
  nowCache = { at: Date.now(), body };
  return body;
}

async function fetchUpcoming(apiKey: string): Promise<Array<Record<string, unknown>>> {
  if (upcomingCache && Date.now() - upcomingCache.at <= UPCOMING_TTL_MS) return upcomingCache.rows;
  const res = await fetch(`https://api.polygon.io/v1/marketstatus/upcoming?apiKey=${apiKey}`);
  if (!res.ok) throw new Error("upcoming_non_ok");
  const body = await res.json();
  if (!Array.isArray(body)) throw new Error("upcoming_malformed");
  upcomingCache = { at: Date.now(), rows: body };
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
  let marketStatus: MarketContextStatus = "unavailable";
  let marketReason: string | null = "CALENDAR_UNAVAILABLE";
  let marketSource: "polygon_marketstatus" | null = null;
  let officialOpenAt: string | null = null;
  let officialCloseAt: string | null = null;
  let nextKnownSessionAt: string | null = null;

  const polygonKey = Deno.env.get("POLYGON_API_KEY");
  if (polygonKey) {
    try {
      const [nowBody, upcoming] = await Promise.all([
        fetchMarketNow(polygonKey),
        fetchUpcoming(polygonKey).catch(() => [] as Array<Record<string, unknown>>),
      ]);
      const todayRows = upcoming.filter((r) => r.date === et.date);
      const closedToday = todayRows.some((r) => String(r.status ?? "").toLowerCase() === "closed");
      const earlyRow = todayRows.find((r) => typeof r.close === "string" && r.close);
      marketStatus = mapMarketStatus(nowBody, { weekday: et.weekday, upcomingClosedToday: closedToday });
      marketSource = "polygon_marketstatus";
      marketReason = marketStatus === "non_trading_day"
        ? "NON_TRADING_DAY"
        : marketStatus === "unavailable"
          ? "CALENDAR_UNAVAILABLE"
          : marketStatus === "premarket"
            ? null
            : "OUTSIDE_PREMARKET";
      if (earlyRow) {
        officialOpenAt = isoOrNull(earlyRow.open) ?? null;
        officialCloseAt = isoOrNull(earlyRow.close) ?? null;
      }
      const future = upcoming
        .filter((r) => isIsoDate(r.date) && (r.date as string) > et.date && String(r.status ?? "").toLowerCase() !== "closed")
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const nextOpen = future.find((r) => typeof r.open === "string");
      nextKnownSessionAt = nextOpen ? isoOrNull(nextOpen.open) : null;
    } catch (_e) {
      console.error("get-pre-market-workspace: market status unavailable");
      marketStatus = isWeekend(et.weekday) ? "non_trading_day" : "unavailable";
      marketReason = marketStatus === "non_trading_day" ? "NON_TRADING_DAY" : "CALENDAR_UNAVAILABLE";
      marketSource = null;
    }
  } else if (isWeekend(et.weekday)) {
    marketStatus = "non_trading_day";
    marketReason = "NON_TRADING_DAY";
  }

  const active = isActiveSession(marketStatus);
  const inPremarket = marketStatus === "premarket";

  // ------------------------------------------------------------- section IO
  const results = await Promise.allSettled([
    userClient.from("market_indexes").select("symbol, name, current_value, change_amount, change_percent, updated_at").in("symbol", INDEX_SYMBOLS),
    userClient.from("watchlists").select("symbol").eq("user_id", userId),
    userClient.from("catalyst_events")
      .select("id, dedupe_key, symbol, company_name, event_type, verification_state, event_date, event_time, time_of_day, title, source_name, source_url, published_at, facts")
      .eq("verification_state", "provider_reported")
      .gte("event_date", new Date(nowMs - CATALYST_RECENT_HOURS * 3600_000).toISOString().slice(0, 10))
      .lte("event_date", new Date(nowMs + 7 * 86400_000).toISOString().slice(0, 10))
      .order("event_date", { ascending: true })
      .limit(400),
    userClient.from("screener_results")
      .select("symbol, company_name, price, change_percent, volume, rvol, updated_at")
      .eq("tab_id", "day_trade_radar")
      .order("volume", { ascending: false, nullsFirst: false })
      .limit(VOLUME_LEADER_LIMIT),
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
  interface IndexOut { symbol: string; name: string | null; value: number; change_percent: number; change_amount: number | null; updated_at: string; stale: boolean }
  let indexes: SectionEnvelope<IndexOut[]>;
  {
    const raw = ok<Array<Record<string, unknown>>>(idxRes as never);
    if (raw === null) {
      indexes = unavailableSection<IndexOut[]>([], "QUERY_FAILED");
    } else {
      const rows: IndexOut[] = [];
      for (const r of raw) {
        const symbol = normalizeSymbol(r.symbol);
        const value = positiveOrNull(r.current_value);
        const cp = finiteOrNull(r.change_percent);
        const ts = isoOrNull(r.updated_at);
        if (!symbol || value === null || cp === null || !ts) continue;
        const age = ageMinutes(ts, nowMs) ?? Infinity;
        rows.push({
          symbol,
          name: typeof r.name === "string" ? r.name : null,
          value,
          change_percent: cp,
          change_amount: finiteOrNull(r.change_amount),
          updated_at: ts,
          stale: active && age > INDEX_STALE_MINUTES,
        });
      }
      rows.sort((a, b) => INDEX_SYMBOLS.indexOf(a.symbol) - INDEX_SYMBOLS.indexOf(b.symbol));
      const newest = rows.reduce<string | null>((acc, r) => (!acc || r.updated_at > acc ? r.updated_at : acc), null);
      const anyStale = rows.some((r) => r.stale);
      indexes = rows.length === 0
        ? emptySection<IndexOut[]>([], "NO_QUALIFYING_DATA")
        : envelope(anyStale ? "stale" : "available", rows, newest, anyStale ? "SOURCE_STALE" : null);
    }
  }

  // -------------------------------------------------- 2. watchlist activity
  const wlRaw = ok<Array<Record<string, unknown>>>(wlRes as never);
  const symbols = (wlRaw ?? [])
    .map((r) => normalizeSymbol(r.symbol))
    .filter((s): s is string => !!s);

  interface WlOut {
    ticker: string; company_name: string | null; direction: string;
    explanation: string; failure_reason: string | null;
    price: number | null; change_pct: number | null; volume: number | null;
    rvol: number | null; rvol_class: string | null;
    market_signals: unknown[]; session_date: string | null; analyzed_at: string | null;
    valid_through: string | null; awaiting_refresh: boolean;
  }
  let watchlist_activity: SectionEnvelope<WlOut[]>;
  let awaitingRefreshCount = 0;
  let analysisRows: Array<Record<string, unknown>> = [];

  if (wlRaw === null) {
    watchlist_activity = unavailableSection<WlOut[]>([], "QUERY_FAILED");
  } else if (symbols.length === 0) {
    watchlist_activity = emptySection<WlOut[]>([], "WATCHLIST_EMPTY");
  } else {
    const [aRes, nRes] = await Promise.allSettled([
      userClient.from("watchlist_analysis_v2").select("*").in("ticker", symbols),
      userClient.from("ticker_search").select("symbol, name").in("symbol", symbols),
    ]);
    const analysis = ok<Array<Record<string, unknown>>>(aRes as never);
    const names = ok<Array<Record<string, unknown>>>(nRes as never) ?? [];
    const nameMap: Record<string, string> = {};
    for (const n of names) {
      const s = normalizeSymbol(n.symbol);
      if (s && typeof n.name === "string") nameMap[s] = n.name;
    }
    if (analysis === null) {
      watchlist_activity = unavailableSection<WlOut[]>([], "QUERY_FAILED");
    } else {
      analysisRows = analysis;
      const byTicker = new Map<string, Record<string, unknown>>();
      for (const a of analysis) {
        const t = normalizeSymbol(a.ticker);
        if (t) byTicker.set(t, a);
      }
      const current: WlOut[] = [];
      for (const sym of symbols) {
        const a = byTicker.get(sym);
        if (!a || !isCurrentPremarketAnalysis(a, et.date, nowMs)) {
          awaitingRefreshCount += 1;
          continue;
        }
        const direction = typeof a.direction === "string" ? a.direction : "data_unavailable";
        const unavailable = direction === "data_unavailable";
        current.push({
          ticker: sym,
          company_name: nameMap[sym] ?? null,
          direction,
          explanation: typeof a.explanation === "string" ? a.explanation : "",
          failure_reason: typeof a.failure_reason === "string" ? a.failure_reason : null,
          price: positiveOrNull(a.price),
          change_pct: finiteOrNull(a.change_pct),
          volume: finiteOrNull(a.volume),
          rvol: finiteOrNull(a.rvol),
          rvol_class: typeof a.rvol_class === "string" ? a.rvol_class : null,
          market_signals: unavailable ? [] : (Array.isArray(a.market_signals) ? a.market_signals : []),
          session_date: isIsoDate(a.session_date) ? a.session_date : null,
          analyzed_at: isoOrNull(a.analyzed_at),
          valid_through: isoOrNull(a.valid_through),
          awaiting_refresh: false,
        });
      }
      const sorted = sortByVolumeDesc(current);
      const newest = sorted.reduce<string | null>((acc, r) => (r.analyzed_at && (!acc || r.analyzed_at > acc) ? r.analyzed_at : acc), null);
      watchlist_activity = sorted.length === 0
        ? emptySection<WlOut[]>([], inPremarket ? "ANALYSIS_AWAITING_REFRESH" : "OUTSIDE_PREMARKET")
        : envelope("available", sorted, newest, null);
    }
  }

  // ------------------------------------------------------------- 3. catalyst
  interface CatOut {
    id: string; symbol: string; company_name: string | null; event_type: string;
    event_date: string; event_time: string | null; time_of_day: string | null;
    title: string; source_name: string | null; source_url: string | null;
    published_at: string | null; facts: unknown;
  }
  const catRaw = ok<Array<Record<string, unknown>>>(catRes as never);
  let catalystRows: CatOut[] = [];
  let catalyst_watch: SectionEnvelope<CatOut[]>;
  if (catRaw === null) {
    catalyst_watch = unavailableSection<CatOut[]>([], "QUERY_FAILED");
  } else {
    for (const r of dedupeCatalyst(catRaw)) {
      if (!isProviderReported(r)) continue;
      const symbol = normalizeSymbol(r.symbol);
      const title = typeof r.title === "string" ? r.title.trim() : "";
      if (!symbol || !title || !isIsoDate(r.event_date)) continue;
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
        published_at: isoOrNull(r.published_at),
        facts: r.facts ?? null,
      });
    }
    const wlSet = new Set(symbols);
    const scored = catalystRows
      .filter((c) => c.event_date >= new Date(nowMs - CATALYST_RECENT_HOURS * 3600_000).toISOString().slice(0, 10))
      .sort((a, b) => {
        const aw = wlSet.has(a.symbol) ? 0 : 1;
        const bw = wlSet.has(b.symbol) ? 0 : 1;
        if (aw !== bw) return aw - bw;
        const at = a.event_date === et.date ? 0 : 1;
        const bt = b.event_date === et.date ? 0 : 1;
        if (at !== bt) return at - bt;
        return a.event_date.localeCompare(b.event_date);
      })
      .slice(0, 12);
    catalyst_watch = scored.length === 0
      ? emptySection<CatOut[]>([], "NO_QUALIFYING_DATA")
      : envelope("available", scored, now.toISOString(), null);
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
    const out: EarnOut[] = todays
      .filter((c) => c.time_of_day === "before_open" || c.time_of_day === null)
      .map((c) => {
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
      : envelope("available", out, now.toISOString(), null);
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
    const rows: VolOut[] = [];
    for (const r of scrRaw) {
      const symbol = normalizeSymbol(r.symbol);
      if (!symbol) continue;
      rows.push({
        symbol,
        company_name: typeof r.company_name === "string" ? r.company_name : null,
        price: positiveOrNull(r.price),
        change_percent: finiteOrNull(r.change_percent),
        volume: finiteOrNull(r.volume),
        rvol: finiteOrNull(r.rvol),
        updated_at: isoOrNull(r.updated_at),
      });
    }
    const newest = rows.reduce<string | null>((acc, r) => (r.updated_at && (!acc || r.updated_at > acc) ? r.updated_at : acc), null);
    const age = ageMinutes(newest, nowMs);
    const stale = active && age !== null && age > SCREENER_STALE_MINUTES;
    volume_leaders = rows.length === 0
      ? emptySection<VolOut[]>([], "NO_QUALIFYING_DATA")
      : envelope(stale ? "stale" : "available", rows, newest, stale ? "SOURCE_STALE" : null);
  }

  // ------------------------------------------------------ 6. journal readiness
  interface JournalReadiness {
    open_trades: number; missing_stop: number; missing_target: number;
    symbols: Array<{ symbol: string; side: string; qty: number | null; missing_stop: boolean; missing_target: boolean }>;
  }
  const jrnRaw = ok<Array<Record<string, unknown>>>(jrnRes as never);
  let journal_readiness: SectionEnvelope<JournalReadiness>;
  let journalMissingRiskCount = 0;
  if (jrnRaw === null) {
    journal_readiness = unavailableSection<JournalReadiness>({ open_trades: 0, missing_stop: 0, missing_target: 0, symbols: [] }, "QUERY_FAILED");
  } else {
    const rows = jrnRaw
      .map((r) => {
        const symbol = normalizeSymbol(r.symbol);
        if (!symbol) return null;
        const side = r.side === "long" || r.side === "short" ? r.side : "long";
        return {
          symbol,
          side,
          qty: finiteOrNull(r.qty),
          missing_stop: positiveOrNull(r.stop_price) === null,
          missing_target: positiveOrNull(r.target_price) === null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const data: JournalReadiness = {
      open_trades: rows.length,
      missing_stop: rows.filter((r) => r.missing_stop).length,
      missing_target: rows.filter((r) => r.missing_target).length,
      symbols: rows,
    };
    journalMissingRiskCount = rows.filter((r) => r.missing_stop || r.missing_target).length;
    journal_readiness = rows.length === 0
      ? envelope("empty", data, now.toISOString(), "NO_QUALIFYING_DATA")
      : envelope("available", data, now.toISOString(), null);
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
  const attention: AttentionItem[] = [];
  {
    for (const row of watchlist_activity.data as WlOut[]) {
      if (row.direction === "data_unavailable") {
        attention.push({ id: `unavail:${row.ticker}`, symbol: row.ticker, kind: "data_unavailable", label: "Data unavailable", detail: row.failure_reason, route: `/dashboard/watchlist?symbol=${encodeURIComponent(row.ticker)}` });
        continue;
      }
      for (const s of row.market_signals) {
        const sig = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
        const dir = typeof sig.direction === "string" ? sig.direction : null;
        const label = typeof sig.label === "string" ? sig.label : typeof sig.id === "string" ? null : null;
        if (dir === "bearish") {
          attention.push({ id: `sig:${row.ticker}:${String(sig.id ?? "b")}`, symbol: row.ticker, kind: "bearish_signal", label: "Bearish market signal", detail: label, route: `/dashboard/watchlist?symbol=${encodeURIComponent(row.ticker)}` });
        } else if (dir === "bullish") {
          attention.push({ id: `sig:${row.ticker}:${String(sig.id ?? "u")}`, symbol: row.ticker, kind: "bullish_signal", label: "Bullish market signal", detail: label, route: `/dashboard/watchlist?symbol=${encodeURIComponent(row.ticker)}` });
        }
      }
      if (row.rvol_class === "unusual" || row.rvol_class === "extreme") {
        attention.push({ id: `rvol:${row.ticker}`, symbol: row.ticker, kind: "unusual_volume", label: "Unusual time-adjusted volume", detail: row.rvol !== null ? `RVOL ${row.rvol.toFixed(2)}` : null, route: `/dashboard/watchlist?symbol=${encodeURIComponent(row.ticker)}` });
      }
    }
    if (awaitingRefreshCount > 0 && watchlist_activity.status !== "unavailable") {
      attention.push({ id: "awaiting_refresh", symbol: null, kind: "awaiting_refresh", label: "Analysis awaiting refresh", detail: `${awaitingRefreshCount} watchlist ${awaitingRefreshCount === 1 ? "symbol has" : "symbols have"} no current pre-market analysis`, route: "/dashboard/watchlist" });
    }
    const wlSet = new Set(symbols);
    for (const c of catalystRows) {
      if (c.event_type === "earnings" && c.event_date === et.date && wlSet.has(c.symbol)) {
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
  const anyAttentionSourceFailed =
    watchlist_activity.status === "unavailable" || journal_readiness.status === "unavailable" || catalyst_watch.status === "unavailable";
  const risk_attention: SectionEnvelope<AttentionItem[]> = attention.length > 0
    ? envelope("available", attention, now.toISOString(), null)
    : anyAttentionSourceFailed
      ? unavailableSection<AttentionItem[]>([], "QUERY_FAILED")
      : emptySection<AttentionItem[]>([], "NO_QUALIFYING_DATA");

  // ------------------------------------------------------------- 9. checklist
  const checklistItems = buildChecklist({
    watchlistPremarketCount: (watchlist_activity.data as WlOut[]).length,
    catalystTodayCount: catalystRows.filter((c) => c.event_date === et.date).length,
    beforeOpenEarningsCount: beforeOpenCount,
    awaitingRefreshCount,
    journalMissingRiskCount,
    volumeLeaderCount: (volume_leaders.data as VolOut[]).length,
  });
  const checklist = checklistItems.length === 0
    ? emptySection(checklistItems, "NO_QUALIFYING_DATA")
    : envelope("available", checklistItems, now.toISOString(), null);

  return json({
    contract_version: CONTRACT_VERSION,
    server_now: now.toISOString(),
    market_context: {
      status: marketStatus,
      et_date: et.date,
      et_time: etTimeLabel(et),
      checked_at: now.toISOString(),
      source: marketSource,
      reason_code: marketReason,
      official_open_at: officialOpenAt,
      official_close_at: officialCloseAt,
      next_known_session_at: nextKnownSessionAt,
    },
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
