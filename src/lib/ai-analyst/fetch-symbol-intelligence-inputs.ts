import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAnalystIntelligencePacket,
  type RadarCandidateRow,
  type WatchlistAnalysisRow,
} from "@/lib/ai-analyst/build-intelligence-packet";
import type {
  AnalystCatalystRow,
  AnalystIntelligencePacket,
  AnalystJournalRow,
  AnalystRadarEventRow,
} from "@/lib/ai-analyst/intelligence-packet-types";
import { AI_ANALYST_INTELLIGENCE_BOUNDS } from "@/config/ai-analyst-intelligence.config";
import { normalizeHandoffSymbol } from "@/lib/watchlist-v2/handoff";

export async function fetchSymbolIntelligenceInputs(
  supabase: SupabaseClient,
  input: {
    symbol: string;
    userId?: string | null;
    handoffSource?: string | null;
    claimedEvent?: string | null;
    userQuestion?: string | null;
  },
): Promise<AnalystIntelligencePacket | null> {
  const symbol = normalizeHandoffSymbol(input.symbol);
  if (!symbol) return null;

  const [radarRes, eventsRes, watchlistRes, catalystRes, journalRes] = await Promise.all([
    supabase.from("radar_v22_candidates").select("*").eq("symbol", symbol).maybeSingle(),
    supabase
      .from("radar_v22_events")
      .select("event_type, event_at, session_kind, trading_date")
      .eq("symbol", symbol)
      .order("event_at", { ascending: false })
      .limit(AI_ANALYST_INTELLIGENCE_BOUNDS.maxRadarEvents),
    supabase.from("watchlist_analysis_v2").select("*").eq("ticker", symbol).maybeSingle(),
    supabase
      .from("catalyst_events")
      .select("event_type, event_date, title, published_at, verification_state, source_name")
      .eq("symbol", symbol)
      .eq("verification_state", "provider_reported")
      .order("published_at", { ascending: false })
      .limit(AI_ANALYST_INTELLIGENCE_BOUNDS.maxCatalystRows),
    input.userId
      ? supabase
          .from("journal_trades")
          .select("symbol, side, status, setup_tag, entry_date")
          .eq("user_id", input.userId)
          .eq("symbol", symbol)
          .order("entry_date", { ascending: false })
          .limit(AI_ANALYST_INTELLIGENCE_BOUNDS.maxJournalTrades)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const radarEvents: AnalystRadarEventRow[] = (eventsRes.data ?? []).map((r) => ({
    eventType: r.event_type ?? null,
    eventAt: r.event_at ?? null,
    sessionKind: r.session_kind ?? null,
    tradingDate: r.trading_date ?? null,
  }));

  const catalystRows: AnalystCatalystRow[] = (catalystRes.data ?? []).map((r) => ({
    eventType: r.event_type,
    eventDate: r.event_date,
    title: r.title,
    publishedAt: r.published_at,
    verificationState: r.verification_state,
    sourceName: r.source_name ?? null,
    attributionClass: "direct",
    tickerSpecific: true,
  }));

  const journalRows: AnalystJournalRow[] = (journalRes.data ?? []).map((r) => ({
    symbol: r.symbol,
    side: r.side,
    status: r.status,
    setupTag: r.setup_tag,
    entryDate: r.entry_date,
  }));

  return buildAnalystIntelligencePacket({
    symbol,
    handoffSource: input.handoffSource,
    radarCandidate: (radarRes.data as RadarCandidateRow | null) ?? null,
    radarEvents,
    watchlistRow: (watchlistRes.data as WatchlistAnalysisRow | null) ?? null,
    catalystRows,
    journalRows,
    claimedEvent: input.claimedEvent,
    userQuestion: input.userQuestion,
  });
}
