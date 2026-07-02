import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdBanner } from "@/components/layout/AdBanner";
import { IndexSparklineCards } from "@/components/home/IndexSparklineCards";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { searchTickers, EXCHANGE_LABELS, type SearchResult } from "@/lib/search-tickers";
import { toast } from "sonner";
import { useWatchlistAI } from "@/hooks/useWatchlistAI";
import {
  Search,
  Star,
  Trash2,
  ChevronDown,
  Pencil,
  RefreshCw,
  Lock,
  Brain,
  ChevronRight,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Zap,
  Bell,
  Calendar,
} from "lucide-react";
import { format, parseISO, isToday, isYesterday, formatDistanceToNow } from "date-fns";

// ── helpers ───────────────────────────────────────────────
function cleanCompanyName(name: string): string {
  return name
    .replace(/,?\s*(Common Stock|Ordinary Shares?|American Depositary Shares?|Depositary Shares?|Class [A-Z]( Common Stock)?|Series [A-Z]|ADS|ADR|Units?|Warrants?|Rights?).*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function abbreviateNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDateLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d, yyyy");
}

function sentimentColor(sentiment: string): string {
  if (sentiment === "Very Bullish") return "text-emerald-600";
  if (sentiment === "Bullish") return "text-green-600";
  if (sentiment === "Neutral") return "text-amber-500";
  return "text-red-500";
}

function sentimentBg(sentiment: string): string {
  if (sentiment === "Very Bullish") return "bg-emerald-50 border-emerald-200";
  if (sentiment === "Bullish") return "bg-green-50 border-green-200";
  if (sentiment === "Neutral") return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-100";
}

function sentimentDot(sentiment: string): string {
  if (sentiment === "Very Bullish") return "bg-emerald-500";
  if (sentiment === "Bullish") return "bg-green-500";
  if (sentiment === "Neutral") return "bg-amber-400";
  return "bg-red-500";
}

function scoreColor(score: number): string {
  if (score >= 75) return "#059669";
  if (score >= 51) return "#16a34a";
  if (score >= 31) return "#d97706";
  return "#dc2626";
}

function scoreBg(score: number): string {
  if (score >= 75) return "bg-emerald-50 border-emerald-200";
  if (score >= 51) return "bg-green-50 border-green-200";
  if (score >= 31) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-100";
}

// Classify tags into two buckets
function classifyTags(tags: string[]): { classification: string[]; signals: string[] } {
  const signalKeywords = [
    "earnings", "rvol", "volume", "breakout", "news", "upgrade", "downgrade",
    "options", "bullish flow", "bearish flow", "catalyst", "fda", "filing",
    "soon", "alert", "momentum", "squeeze", "gap",
  ];
  const classification: string[] = [];
  const signals: string[] = [];
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (signalKeywords.some((k) => lower.includes(k))) {
      signals.push(tag);
    } else {
      classification.push(tag);
    }
  }
  return { classification, signals };
}

// Inline SVG sparkline from price change direction
function MiniSparkline({ positive, width = 80, height = 28 }: { positive: boolean; width?: number; height?: number }) {
  const color = positive ? "#16a34a" : "#dc2626";
  const path = positive
    ? `M0,${height} L${width * 0.2},${height * 0.7} L${width * 0.4},${height * 0.8} L${width * 0.6},${height * 0.4} L${width * 0.8},${height * 0.25} L${width},${height * 0.1}`
    : `M0,${height * 0.1} L${width * 0.2},${height * 0.3} L${width * 0.4},${height * 0.2} L${width * 0.6},${height * 0.55} L${width * 0.8},${height * 0.7} L${width},${height * 0.9}`;
  const fillPath = path + ` L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="opacity-80">
      <defs>
        <linearGradient id={`sg-${positive}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#sg-${positive})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// HF Score Ring — hero element
function HFScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = scoreColor(score);
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={5} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-sm font-black leading-none" style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

function ClassificationTag({ tag }: { tag: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
      {tag}
    </span>
  );
}

function SignalTag({ tag }: { tag: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
      <Zap className="h-2.5 w-2.5" />
      {tag}
    </span>
  );
}

// Animated AI Monitor status
const SCAN_STATES = [
  "Scanning news sources...",
  "Checking SEC filings...",
  "Analyzing price action...",
  "Monitoring options flow...",
  "Evaluating catalysts...",
  "Recalculating HF Scores...",
];

function AIMonitorBar({
  tickerCount,
  alertCount,
  lastUpdated,
  alerts,
}: {
  tickerCount: number;
  alertCount: number;
  lastUpdated: Date | null;
  alerts: AIAlertType[];
}) {
  const [scanIdx, setScanIdx] = useState(0);
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setScanIdx((i) => (i + 1) % SCAN_STATES.length), 2800);
    return () => clearInterval(t);
  }, []);

  const alertTypeLabel: Record<string, string> = {
    score_change: "Score updated",
    sentiment_change: "Sentiment changed",
    catalyst: "Catalyst detected",
    unusual_options: "Unusual options activity",
    volume_spike: "Volume spike detected",
    price_move: "Price movement",
    news_break: "Breaking news",
    earnings: "Earnings event",
    analyst_action: "Analyst action",
  };

  return (
    <div className="mb-3 rounded-xl border border-border bg-card overflow-hidden">
      {/* Bar */}
      <button
        onClick={() => setLogOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2 shrink-0">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-bold text-foreground">HF AI Monitor</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
          <span>Watching <strong className="text-foreground">{tickerCount}</strong> stocks</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">Scanning <strong className="text-foreground">1,200+</strong> news sources</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">Monitoring <strong className="text-foreground">14</strong> earnings</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline"><strong className="text-foreground">{alertCount}</strong> alerts today</span>
        </div>
        <div className="hidden lg:flex items-center gap-1.5 text-xs text-purple-600 font-medium italic">
          <Brain className="h-3 w-3 shrink-0" />
          {SCAN_STATES[scanIdx]}
        </div>
        {lastUpdated && (
          <span className="text-xs text-muted-foreground hidden sm:inline ml-auto">
            Updated <strong className="text-foreground">{formatDistanceToNow(lastUpdated, { addSuffix: true })}</strong>
          </span>
        )}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-emerald-600 font-bold tracking-wide">LIVE</span>
          </div>
          <span className="text-muted-foreground text-xs">{logOpen ? "▲" : "▼"} Activity Log</span>
        </div>
      </button>

      {/* Activity Log Panel */}
      {logOpen && (
        <div className="border-t border-border bg-surface/60 px-4 py-3 max-h-[320px] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Brain className="h-3.5 w-3.5 text-purple-500" />
              HF AI Activity Log
            </span>
            <span className="text-[10px] text-muted-foreground">{alerts.length} events recorded</span>
          </div>

          {alerts.length === 0 ? (
            <div className="py-6 text-center">
              <div className="text-xs text-muted-foreground mb-1">No activity yet</div>
              <div className="text-[11px] text-muted-foreground">
                AI will log updates here as it monitors your stocks.
              </div>
            </div>
          ) : (
            <div className="space-y-0">
              {alerts.map((alert, idx) => {
                const up = alert.score_to !== null && alert.score_from !== null && alert.score_to > alert.score_from;
                const isLast = idx === alerts.length - 1;
                return (
                  <div key={alert.id} className="flex gap-3 py-2">
                    {/* Timeline spine */}
                    <div className="flex flex-col items-center shrink-0 w-4">
                      <div className={cn(
                        "h-2.5 w-2.5 rounded-full border-2 shrink-0 mt-0.5",
                        up ? "bg-emerald-500 border-emerald-400" : "bg-red-500 border-red-400"
                      )} />
                      {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0 pb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-black text-accent-blue">{alert.ticker}</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-[11px] font-semibold text-foreground">
                          {alertTypeLabel[alert.alert_type] ?? alert.alert_type.replace("_", " ")}
                        </span>
                        {alert.score_from !== null && alert.score_to !== null && (
                          <span className={cn(
                            "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded",
                            up ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                          )}>
                            {alert.score_from} → {alert.score_to}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                          {format(new Date(alert.created_at), "h:mm a")}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{alert.reason}</p>
                      {alert.reasoning?.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {alert.reasoning.slice(0, 2).map((r, i) => (
                            <span key={i} className="text-[10px] text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5 line-clamp-1 max-w-[200px]">
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface WatchlistEntryType {
  id: string;
  symbol: string;
}

interface AIAnalysisType {
  ticker: string;
  hf_score: number;
  hf_score_prev: number | null;
  score_delta: number | null;
  sentiment: "Bearish" | "Neutral" | "Bullish" | "Very Bullish";
  sentiment_prev: string | null;
  confidence: number;
  summary: string;
  reasoning: string[];
  smart_tags: string[];
  signals: Record<string, unknown>;
  analyzed_at: string;
  prev_analyzed_at: string | null;
}

interface AIAlertType {
  id: string;
  ticker: string;
  alert_type: string;
  score_from: number | null;
  score_to: number | null;
  sentiment_from: string | null;
  sentiment_to: string | null;
  confidence: number | null;
  reason: string;
  reasoning: string[];
  created_at: string;
}

function WatchlistStockRow({
  entry,
  snap,
  nameMap,
  tickerNames,
  aiData,
  aiAlerts,
  onRemove,
  refreshing,
  onRefresh,
}: {
  entry: WatchlistEntryType;
  snap: Record<string, unknown> | undefined;
  nameMap: Record<string, string> | undefined;
  tickerNames: Record<string, string>;
  aiData: AIAnalysisType | undefined;
  aiAlerts: AIAlertType[];
  onRemove: (id: string, symbol: string) => void;
  refreshing: boolean;
  onRefresh: (ticker: string) => void;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [showWhyChanged, setShowWhyChanged] = useState(false);
  const symbol = entry.symbol;
  const name = cleanCompanyName(nameMap?.[symbol] || tickerNames[symbol] || symbol);

  const snapAny = snap as Record<string, Record<string, number>> | undefined;
  const dayClose = snapAny?.day?.c;
  const minClose = snapAny?.min?.c;
  const lastTrade = snapAny?.lastTrade?.p;
  const prevClose = snapAny?.prevDay?.c;
  const price =
    dayClose && dayClose > 0 ? dayClose
    : minClose && minClose > 0 ? minClose
    : lastTrade && lastTrade > 0 ? lastTrade
    : prevClose && prevClose > 0 ? prevClose
    : 0;
  const snapNum = snap as Record<string, number> | undefined;
  const changePct = snapNum?.todaysChangePerc ?? 0;
  const volume = (snapAny?.day?.v ?? 0) > 0 ? snapAny!.day.v : (snapAny?.min?.av ?? 0);
  const pricePos = changePct >= 0;

  const tickerAlerts = aiAlerts.filter((a) => a.ticker === symbol).slice(0, 3);
  const latestAlert = tickerAlerts[0];

  const { classification, signals } = aiData?.smart_tags?.length
    ? classifyTags(aiData.smart_tags)
    : { classification: [], signals: [] };

  const scoreDeltaChanged = aiData?.score_delta !== null && aiData?.score_delta !== undefined && aiData.score_delta !== 0;
  const sentimentChanged = aiData?.sentiment_prev && aiData.sentiment_prev !== aiData.sentiment;

  return (
    <div className={cn(
      "mb-2 overflow-hidden rounded-xl border transition-all duration-200",
      "bg-card border-border hover:border-border/80 hover:shadow-sm",
      expanded && "ring-1 ring-accent-blue/20 border-accent-blue/30"
    )}>
      {/* Main row */}
      <div className="flex items-stretch gap-0">

        {/* Sentiment color bar */}
        {aiData && (
          <div className={cn(
            "w-1 shrink-0 rounded-l-xl",
            aiData.sentiment === "Very Bullish" ? "bg-emerald-500"
            : aiData.sentiment === "Bullish" ? "bg-green-400"
            : aiData.sentiment === "Neutral" ? "bg-amber-400"
            : "bg-red-500"
          )} />
        )}
        {!aiData && <div className="w-1 shrink-0 rounded-l-xl bg-border" />}

        <div className="flex-1 flex items-center gap-3 px-3 py-3 min-w-0">

          {/* LEFT: Symbol + Name + Tags + Earnings */}
          <div className="min-w-0 w-[180px] shrink-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <button
                onClick={() => navigate(`/stocks/${symbol.toLowerCase()}`)}
                className="ticker-symbol text-accent-blue hover:underline text-sm font-black tracking-wide"
              >
                {symbol}
              </button>
              {aiData && (
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", sentimentDot(aiData.sentiment))} />
              )}
            </div>
            <div className="text-[11px] text-muted-foreground truncate mb-1.5">{name}</div>
            <div className="flex flex-wrap gap-1">
              {classification.slice(0, 2).map((tag) => (
                <ClassificationTag key={tag} tag={tag} />
              ))}
              {signals.slice(0, 1).map((tag) => (
                <SignalTag key={tag} tag={tag} />
              ))}
            </div>
          </div>

          {/* SPARKLINE + PRICE */}
          <div className="flex flex-col items-center min-w-[80px] shrink-0">
            <MiniSparkline positive={pricePos} />
            <div className="text-xs font-bold tabular-nums text-foreground mt-0.5">
              {price > 0 ? `$${price.toFixed(2)}` : "—"}
            </div>
            <div className={cn("text-[10px] tabular-nums font-semibold", pricePos ? "price-positive" : "price-negative")}>
              {pricePos ? "+" : ""}{changePct.toFixed(2)}%
            </div>
          </div>

          {/* Vol */}
          <div className="text-center min-w-[48px] hidden sm:block shrink-0">
            <div className="text-[10px] text-muted-foreground mb-0.5">Vol</div>
            <div className="text-xs tabular-nums text-foreground font-medium">
              {volume > 0 ? abbreviateNumber(volume) : "—"}
            </div>
          </div>

          {/* HF SCORE — hero */}
          <div className="flex flex-col items-center min-w-[64px] shrink-0">
            {aiData ? (
              <>
                <div className="text-[8px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">HF Score</div>
                <HFScoreRing score={aiData.hf_score} size={48} />
                {scoreDeltaChanged && (
                  <button
                    onClick={() => setShowWhyChanged((v) => !v)}
                    className={cn(
                      "text-[10px] font-bold mt-0.5 flex items-center gap-0.5 hover:underline",
                      aiData.score_delta! > 0 ? "text-emerald-600" : "text-red-500"
                    )}
                    title="Why changed?"
                  >
                    {aiData.score_delta! > 0 ? "▲" : "▼"} {Math.abs(aiData.score_delta!)}
                    <span className="text-muted-foreground font-normal">?</span>
                  </button>
                )}
                <div className="text-[9px] text-muted-foreground mt-0.5">{aiData.confidence}% conf.</div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <div className="h-12 w-12 rounded-full border-4 border-dashed border-border flex items-center justify-center">
                  <span className="text-[10px] text-muted-foreground">—</span>
                </div>
                <span className="text-[9px] text-muted-foreground">Pending</span>
              </div>
            )}
          </div>

          {/* AI OUTLOOK — centerpiece */}
          <div className="flex-1 min-w-0 hidden md:block">
            {aiData ? (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Brain className="h-3 w-3 text-purple-500 shrink-0" />
                  <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wide">HF AI Outlook</span>
                  <span className={cn("text-xs font-black ml-1", sentimentColor(aiData.sentiment))}>
                    {aiData.sentiment}
                  </span>
                </div>
                {sentimentChanged && (
                  <div className="text-[10px] text-muted-foreground mb-1">
                    <span className="text-foreground font-medium">{aiData.sentiment_prev}</span>
                    <span className="mx-1">→</span>
                    <span className={cn("font-bold", sentimentColor(aiData.sentiment))}>{aiData.sentiment}</span>
                  </div>
                )}
                <p className="text-[11px] text-foreground leading-snug line-clamp-2 mb-1.5">
                  {aiData.summary}
                </p>
                {aiData.reasoning?.slice(0, 2).map((r, i) => (
                  <div key={i} className="flex items-start gap-1 text-[10px] text-muted-foreground">
                    <span className="text-purple-400 shrink-0 mt-0.5">•</span>
                    <span className="line-clamp-1">{r}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <div className="text-xs text-muted-foreground">No AI analysis yet</div>
                <button
                  onClick={() => onRefresh(symbol)}
                  disabled={refreshing}
                  className="text-[10px] text-accent-blue hover:underline text-left"
                >
                  {refreshing ? "Analyzing..." : "Run analysis →"}
                </button>
              </div>
            )}
          </div>

          {/* Latest alert badge */}
          {latestAlert && (
            <div className="hidden xl:flex flex-col min-w-[100px] shrink-0">
              <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                <Bell className="h-2.5 w-2.5" /> Latest Alert
              </div>
              <div className={cn(
                "rounded-lg px-2 py-1.5 border text-[10px]",
                latestAlert.score_to !== null && latestAlert.score_from !== null && latestAlert.score_to > latestAlert.score_from
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-red-50 border-red-100 text-red-700"
              )}>
                <div className="font-bold capitalize">{latestAlert.alert_type.replace("_", " ")}</div>
                {latestAlert.score_from !== null && latestAlert.score_to !== null && (
                  <div className="font-mono">{latestAlert.score_from} → {latestAlert.score_to}</div>
                )}
                <div className="text-[9px] opacity-70 mt-0.5">
                  {formatDistanceToNow(new Date(latestAlert.created_at), { addSuffix: true })}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col items-center gap-1.5 shrink-0 ml-1">
            <button
              onClick={() => onRefresh(symbol)}
              disabled={refreshing}
              className="text-muted-foreground hover:text-accent-blue transition-colors p-1 rounded"
              title="Refresh AI analysis"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            </button>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => onRemove(entry.id, symbol)}
              className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Why Changed inline panel */}
      {showWhyChanged && aiData && scoreDeltaChanged && (
        <div className="border-t border-border mx-4 py-2.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className={cn("text-xs font-bold", aiData.score_delta! > 0 ? "text-emerald-600" : "text-red-500")}>
              Why did HF Score {aiData.score_delta! > 0 ? "increase" : "decrease"} {Math.abs(aiData.score_delta!)} points?
            </span>
            <button onClick={() => setShowWhyChanged(false)} className="ml-auto text-muted-foreground hover:text-foreground text-xs">✕</button>
          </div>
          <ul className="space-y-1">
            {aiData.reasoning.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <span className={cn("shrink-0 mt-0.5", aiData.score_delta! > 0 ? "text-emerald-500" : "text-red-400")}>•</span>
                {r}
              </li>
            ))}
          </ul>
          {aiData.prev_analyzed_at && (
            <div className="text-[10px] text-muted-foreground mt-1.5">
              Previous analysis: {formatDistanceToNow(new Date(aiData.prev_analyzed_at), { addSuffix: true })}
            </div>
          )}
        </div>
      )}

      {/* Expanded section */}
      {expanded && aiData && (
        <div className="border-t border-border px-4 py-3 bg-surface/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Full AI Analysis */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Brain className="h-3.5 w-3.5 text-purple-500" />
                <span className="text-xs font-bold text-foreground">Full AI Analysis</span>
                <span className={cn("ml-auto text-xs font-black", sentimentColor(aiData.sentiment))}>
                  {aiData.sentiment}
                </span>
                <span className="text-[10px] text-muted-foreground">· {aiData.confidence}% confidence</span>
              </div>
              <div className={cn("rounded-lg border p-2.5 mb-2.5", sentimentBg(aiData.sentiment))}>
                <p className="text-xs text-foreground leading-relaxed font-medium">{aiData.summary}</p>
              </div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Primary Drivers</div>
              <ul className="space-y-1.5">
                {aiData.reasoning.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <span className="text-purple-400 mt-0.5 shrink-0">•</span>
                    {r}
                  </li>
                ))}
              </ul>
              {aiData.analyzed_at && (
                <p className="text-[10px] text-muted-foreground mt-2.5 border-t border-border pt-2">
                  Last analyzed {formatDistanceToNow(new Date(aiData.analyzed_at), { addSuffix: true })}
                  {aiData.hf_score_prev !== null && (
                    <span className="ml-2">· Previous score: <strong>{aiData.hf_score_prev}</strong></span>
                  )}
                </p>
              )}
            </div>

            {/* Alert History */}
            <div>
              <div className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5 text-amber-500" />
                AI Alert History
              </div>
              {tickerAlerts.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
                  No alerts yet for {symbol}
                </div>
              ) : (
                <div className="space-y-2">
                  {tickerAlerts.map((alert) => {
                    const up = alert.score_to !== null && alert.score_from !== null && alert.score_to > alert.score_from;
                    return (
                      <div key={alert.id} className={cn("rounded-lg border p-2.5", up ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-100")}>
                        <div className="flex items-center gap-1.5 mb-1">
                          {up ? <TrendingUp className="h-3 w-3 text-emerald-600" /> : <TrendingDown className="h-3 w-3 text-red-500" />}
                          <span className={cn("text-xs font-bold capitalize", up ? "text-emerald-700" : "text-red-700")}>
                            {alert.alert_type.replace("_", " ")}
                          </span>
                          {alert.score_from !== null && alert.score_to !== null && (
                            <span className="text-xs font-mono ml-auto text-muted-foreground">
                              {alert.score_from} → {alert.score_to}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-foreground">{alert.reason}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Smart tags full list */}
              {(classification.length > 0 || signals.length > 0) && (
                <div className="mt-3">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">All Tags</div>
                  <div className="flex flex-wrap gap-1">
                    {classification.map((t) => <ClassificationTag key={t} tag={t} />)}
                    {signals.map((t) => <SignalTag key={t} tag={t} />)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════
const WatchlistPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const searchRef = useRef<HTMLDivElement>(null);
  const [tickerNames, setTickerNames] = useState<Record<string, string>>({});
  const [newsLimit, setNewsLimit] = useState(20);

  const { data: watchlistEntries, isLoading: wlLoading } = useQuery({
    queryKey: ["watchlist", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("watchlists")
        .select("id, symbol")
        .eq("user_id", user!.id)
        .order("added_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const symbols = useMemo(() => (watchlistEntries ?? []).map((e) => e.symbol), [watchlistEntries]);

  const { analysis, alerts, lastUpdated, refreshTicker, refreshing } = useWatchlistAI(symbols);

  const { data: snapshotData } = useQuery({
    queryKey: ["watchlist-snapshots", symbols],
    queryFn: async () => {
      if (symbols.length === 0) return {};
      const results: Record<string, unknown> = {};
      await Promise.all(
        symbols.map(async (sym) => {
          try {
            const { data, error } = await supabase.functions.invoke("get-watchlist-data", { body: { ticker: sym } });
            if (error) throw error;
            results[sym] = data;
          } catch { /* skip */ }
        })
      );
      return results;
    },
    enabled: symbols.length > 0,
    refetchInterval: 60_000,
  });

  const { data: nameMap } = useQuery({
    queryKey: ["watchlist-names", symbols],
    queryFn: async () => {
      if (symbols.length === 0) return {};
      const { data } = await supabase.from("ticker_search").select("symbol, name").in("symbol", symbols);
      const map: Record<string, string> = {};
      (data ?? []).forEach((r) => { map[r.symbol] = r.name; });
      return map;
    },
    enabled: symbols.length > 0,
    staleTime: 5 * 60_000,
  });

  const { data: news, isLoading: newsLoading } = useQuery({
    queryKey: ["watchlist-news", newsLimit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_news")
        .select("*")
        .order("published_at", { ascending: false })
        .limit(newsLimit);
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const { error } = await supabase.from("watchlists").insert({ symbol: symbol.toUpperCase(), user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: async (_d, symbol) => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      trackEvent("watchlist_add", { ticker: symbol });
      toast.success(`${symbol.toUpperCase()} added to watchlist`);
      const { data } = await supabase.from("ticker_search").select("name").eq("symbol", symbol.toUpperCase()).limit(1).maybeSingle();
      if (data?.name) setTickerNames((prev) => ({ ...prev, [symbol.toUpperCase()]: data.name }));
      // AI analysis is triggered server-side via Database Webhook on watchlists INSERT
    },
    onError: (err: unknown, symbol) => {
      const e = err as { code?: string; message?: string };
      if (e?.code === "23505") toast.info(`${symbol.toUpperCase()} is already in your watchlist`);
      else toast.error("Failed to add to watchlist", { description: e?.message });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async ({ id, symbol }: { id: string; symbol: string }) => {
      const { error } = await supabase.from("watchlists").delete().eq("id", id);
      if (error) throw error;
      return symbol;
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["watchlist"] });
      const prev = queryClient.getQueryData(["watchlist", user?.id]);
      queryClient.setQueryData(["watchlist", user?.id], (old: WatchlistEntryType[] | undefined) => old?.filter((w) => w.id !== id) ?? []);
      return { prev };
    },
    onError: (_e: unknown, _v: unknown, ctx: { prev: unknown } | undefined) => {
      if (ctx?.prev) queryClient.setQueryData(["watchlist", user?.id], ctx.prev);
    },
    onSettled: (_d: unknown, _e: unknown, vars: { id: string; symbol: string } | undefined) => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      if (vars) trackEvent("watchlist_remove", { ticker: vars.symbol });
    },
  });

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        let data = await searchTickers(value);
        if (!data || data.length === 0) {
          const { data: rows } = await supabase
            .from("ticker_search")
            .select("symbol, name, exchange, type")
            .or(`symbol.ilike.${value.toUpperCase()}%,name.ilike.%${value}%`)
            .eq("active", true)
            .order("symbol")
            .limit(10);
          data = (rows ?? []).map((r) => ({ ticker: r.symbol, name: r.name, exchange: r.exchange, type: r.type }));
        }
        setSearchResults(data);
        setShowSearchResults(true);
      } catch {
        setSearchResults([]);
        setShowSearchResults(true);
      }
      setIsSearching(false);
    }, 200);
  }, []);

  const handleSelectResult = (r: SearchResult) => {
    addMutation.mutate(r.ticker);
    setSearchQuery("");
    setSearchResults([]);
    setShowSearchResults(false);
  };

  const comingSoon = () => toast("Coming Soon", { description: "This feature is not yet available." });

  // AI stats for dashboard cards
  const aiStats = useMemo(() => {
    const values = Object.values(analysis);
    if (!values.length) return null;
    const avgScore = Math.round(values.reduce((s, a) => s + a.hf_score, 0) / values.length);
    const avgScorePrev = values.filter((a) => a.hf_score_prev !== null).length
      ? Math.round(values.filter((a) => a.hf_score_prev !== null).reduce((s, a) => s + (a.hf_score_prev ?? 0), 0) / values.filter((a) => a.hf_score_prev !== null).length)
      : null;
    const scoreDelta = avgScorePrev !== null ? avgScore - avgScorePrev : null;
    const bullish = values.filter((a) => a.sentiment === "Bullish" || a.sentiment === "Very Bullish").length;
    const bearish = values.filter((a) => a.sentiment === "Bearish").length;
    const highConviction = values.filter((a) => a.hf_score >= 75 && a.confidence >= 80).length;
    const latestAlert = alerts[0];
    return { avgScore, scoreDelta, bullish, bearish, highConviction, latestAlert };
  }, [analysis, alerts]);

  const groupedNews = useMemo(() => {
    if (!news) return [];
    const groups: { date: string; items: typeof news }[] = [];
    for (const item of news) {
      const dateKey = item.published_at ? format(parseISO(item.published_at), "yyyy-MM-dd") : "unknown";
      const existing = groups.find((g) => g.date === dateKey);
      if (existing) existing.items.push(item);
      else groups.push({ date: dateKey, items: [item] });
    }
    return groups;
  }, [news]);

  return (
    <div>
      <title>My AI Watchlist | HedgeFun</title>
      <IndexSparklineCards />
      <div className="w-full flex flex-col items-center border-b border-border bg-surface py-1">
        <AdBanner slot="top" />
      </div>

      <div className="px-4 py-4 max-w-[1200px]">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-black text-foreground tracking-tight">My AI Watchlist</h1>
            <p className="text-xs text-muted-foreground mt-0.5">AI-powered research workspace · Every stock continuously monitored</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Button variant="outline" size="sm" className="text-sm gap-1 h-8 px-3">
            My Watchlist <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <div ref={searchRef} className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
              placeholder="Add new stock..."
              className="pl-8 h-8 text-sm w-[200px]"
            />
            {showSearchResults && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden max-h-[300px] overflow-y-auto">
                {searchResults.map((r) => (
                  <button
                    key={r.ticker}
                    onClick={() => handleSelectResult(r)}
                    className="w-full px-3 py-2 flex items-center gap-2 hover:bg-accent text-left text-sm"
                  >
                    <span className="ticker-symbol text-accent-blue text-xs font-semibold">{r.ticker}</span>
                    <span className="text-foreground truncate flex-1">{r.name}</span>
                    <span className="text-[0.6875rem] text-muted-foreground">
                      {EXCHANGE_LABELS[r.exchange ?? ""] ?? r.exchange ?? ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {isSearching && searchQuery.trim().length >= 1 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 px-3 py-2 text-sm text-muted-foreground">
                Searching...
              </div>
            )}
            {showSearchResults && searchResults.length === 0 && searchQuery.trim().length >= 1 && !isSearching && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 px-3 py-2 text-sm text-muted-foreground">
                No results for "{searchQuery}"
              </div>
            )}
          </div>
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-sm" onClick={comingSoon}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        </div>

        {/* Executive Dashboard Cards */}
        {aiStats && symbols.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {/* Avg HF Score */}
            <div className={cn("rounded-xl border px-3 py-3", scoreBg(aiStats.avgScore))}>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Avg HF Score</p>
              <div className="flex items-end gap-1.5">
                <p className="text-2xl font-black" style={{ color: scoreColor(aiStats.avgScore) }}>{aiStats.avgScore}</p>
                {aiStats.scoreDelta !== null && aiStats.scoreDelta !== 0 && (
                  <span className={cn("text-xs font-bold mb-0.5", aiStats.scoreDelta > 0 ? "text-emerald-600" : "text-red-500")}>
                    {aiStats.scoreDelta > 0 ? "▲" : "▼"} {Math.abs(aiStats.scoreDelta)} today
                  </span>
                )}
              </div>
            </div>

            {/* Bullish */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Bullish</p>
              <p className="text-2xl font-black text-emerald-600">{aiStats.bullish}</p>
              <p className="text-[10px] text-muted-foreground">of {symbols.length} stocks</p>
            </div>

            {/* Bearish */}
            <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Bearish</p>
              <p className="text-2xl font-black text-red-500">{aiStats.bearish}</p>
              <p className="text-[10px] text-muted-foreground">of {symbols.length} stocks</p>
            </div>

            {/* Latest Alert */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 flex items-center gap-1">
                <Bell className="h-2.5 w-2.5" /> Latest Alert
              </p>
              {aiStats.latestAlert ? (
                <>
                  <p className="text-lg font-black text-foreground">{aiStats.latestAlert.ticker}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">
                    Score {aiStats.latestAlert.score_from} → {aiStats.latestAlert.score_to}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No alerts yet</p>
              )}
            </div>
          </div>
        )}

        {/* AI Monitor Bar */}
        {symbols.length > 0 && (
          <AIMonitorBar
            tickerCount={symbols.length}
            alertCount={alerts.length}
            lastUpdated={lastUpdated}
            alerts={alerts}
          />
        )}

        {/* Auth / Loading / Empty / Rows */}
        {!user ? (
          <div className="rounded-xl border border-border bg-card flex flex-col items-center justify-center px-6 py-16 text-center my-4">
            <Lock className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-bold text-foreground mb-2">Sign in to access your Watchlist</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">Save stocks and track your portfolio in one place.</p>
            <div className="flex gap-3">
              <Button className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground" onClick={() => navigate("/signup")}>
                Sign Up Free
              </Button>
              <Button variant="outline" onClick={() => navigate("/login")}>Log In</Button>
            </div>
          </div>
        ) : wlLoading ? (
          <div className="space-y-2 my-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : (watchlistEntries ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border flex flex-col items-center justify-center px-6 py-12 text-center my-4">
            <Star className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">Add stocks to your watchlist to track them here</p>
            <p className="text-xs text-muted-foreground">Use the search bar above to find and add tickers.</p>
          </div>
        ) : (
          <div className="my-4 space-y-0">
            {(watchlistEntries ?? []).map((entry) => (
              <WatchlistStockRow
                key={entry.id}
                entry={entry}
                snap={snapshotData?.[entry.symbol] as Record<string, unknown> | undefined}
                nameMap={nameMap}
                tickerNames={tickerNames}
                aiData={analysis[entry.symbol]}
                aiAlerts={alerts}
                onRemove={(id, symbol) => removeMutation.mutate({ id, symbol })}
                refreshing={!!refreshing[entry.symbol]}
                onRefresh={refreshTicker}
              />
            ))}
          </div>
        )}

        {/* News */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-bold text-foreground">News</h2>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ["watchlist-news"] })}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          {newsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full rounded" />
              ))}
            </div>
          ) : (
            <>
              {groupedNews.map((group) => (
                <div key={group.date} className="mb-4">
                  <p className="text-[0.8125rem] font-semibold text-muted-foreground mb-2">
                    {formatDateLabel(group.date)}
                  </p>
                  <div className="space-y-0">
                    {group.items.map((item) => {
                      const time = item.published_at ? format(parseISO(item.published_at), "h:mm a") : "";
                      return (
                        <div key={item.id} className="flex items-start gap-3 py-2 border-b border-border-subtle last:border-b-0">
                          <span className="text-[0.8125rem] text-muted-foreground w-[52px] shrink-0 tabular-nums pt-0.5">
                            {time}
                          </span>
                          <div className="flex-1 min-w-0">
                            <a
                              href={item.url ?? "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[0.875rem] text-accent-blue hover:underline leading-snug"
                            >
                              {item.headline}
                            </a>
                            {item.source && (
                              <span className="ml-2 text-[0.8125rem] text-muted-foreground">{item.source}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {(news?.length ?? 0) >= newsLimit && (
                <Button variant="outline" size="sm" onClick={() => setNewsLimit((l) => l + 20)} className="mt-2">
                  Load More
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
        <AdBanner slot="bottom" />
      </div>
    </div>
  );
};

export default WatchlistPage;
