import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { hasProAccess } from "@/lib/entitlement";
import { AIBriefCard } from "@/components/dashboard/AIBriefCard";
import { usePreMarketWorkspace } from "@/hooks/usePreMarketWorkspace";
import { usePageSeo } from "@/hooks/usePageSeo";
import { AM_INBOX_CONFIG } from "@/config/inbox.config";
import {
  SectionShell,
  SectionHeading,
  SectionEmpty,
  SectionLoading,
  SectionUnavailable,
} from "@/components/pre-market/SectionShell";
import { SessionBanner } from "@/components/pre-market/SessionBanner";
import { IndexCards } from "@/components/pre-market/IndexCards";
import { CatalystWatchList } from "@/components/pre-market/CatalystWatchList";
import { EarningsList } from "@/components/pre-market/EarningsList";
import { WatchlistActivityList, WatchlistSessionCompact } from "@/components/pre-market/WatchlistActivityList";
import { VolumeLeaderList } from "@/components/pre-market/VolumeLeaderList";
import { RiskAttentionList } from "@/components/pre-market/RiskAttentionList";
import { OpeningBellChecklist } from "@/components/pre-market/OpeningBellChecklist";
import { HeadlinesList } from "@/components/pre-market/HeadlinesList";
import { etTimestampLabel, relativeAge } from "@/lib/pre-market/builders";
import {
  compactWatchlistNotice,
  isActivePremarketSession,
  watchlistTrackedCount,
} from "@/lib/session-intelligence/watchlist-session";

export default function AMInbox() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isPro = hasProAccess(profile?.plan);

  usePageSeo({
    title: "Pre-Market Workspace · Stocksist",
    description:
      "Pre-market workspace with provider-reported catalysts, before-open earnings, watchlist activity and market headlines.",
  });

  const ws = usePreMarketWorkspace();
  const data = ws.data;
  const loading = ws.isLoading;
  const etDate = data?.market_context.et_date ?? "";
  const marketStatus = data?.market_context.status;
  const premarketActive = isActivePremarketSession(marketStatus);

  const catalysts = useMemo(() => data?.catalyst_watch.data ?? [], [data]);

  const trackedCount = useMemo(
    () =>
      watchlistTrackedCount(
        (data?.watchlist_activity.data ?? []).map((r) => r.ticker),
        (data?.watchlist_lifecycle ?? []).map((l) => l.ticker),
      ),
    [data],
  );
  const watchlistNotice = compactWatchlistNotice(marketStatus, trackedCount);

  if (!ws.isAuthenticated) {
    return (
      <div className="p-4 md:p-6">
        <div className="rounded-xl border bg-card p-8 text-center">
          <h1 className="text-xl font-semibold">Sign in to open your Pre-Market workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This workspace reads only your authenticated account data.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-full flex-col gap-4 overflow-x-hidden p-4 md:p-6">
      {/* 1 — Title + honest data labeling */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Pre-Market</h1>
          <p className="text-sm text-muted-foreground">
            Production workspace · 15-minute delayed market data
          </p>
        </div>
        <button
          onClick={ws.retry}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${ws.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      {ws.isStaleUpdateFailed && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          Update failed — showing the last successful workspace from{" "}
          {etTimestampLabel(ws.dataAsOf)} ({relativeAge(ws.dataAsOf)}).
        </div>
      )}

      {ws.isUnavailable ? (
        <SectionUnavailable reason="QUERY_FAILED" onRetry={ws.retry} />
      ) : (
        <>
          {/* Session status */}
          <SessionBanner context={data?.market_context ?? null} loading={loading} />

          {data && (
            <p className="text-[11px] text-muted-foreground">
              Workspace as of {etTimestampLabel(data.server_now)} · {relativeAge(data.server_now)}
            </p>
          )}

          {/* Market Pulse */}
          <SectionShell
            title="Market Pulse"
            subtitle="SPY · QQQ · DIA · IWM — 15-minute delayed"
            section={data?.indexes ?? null}
            loading={loading}
            emptyMessage="No index values met validation."
            onRetry={ws.retry}
          >
            <IndexCards rows={data?.indexes.data ?? []} />
          </SectionShell>

          {/* Volume Leaders — screener_results, not Radar V2.2 */}
          <SectionShell
            title="Day-Trade Radar · sorted by volume"
            subtitle="Screener results · 15-minute delayed · not session-attributed"
            section={data?.volume_leaders ?? null}
            loading={loading}
            emptyMessage="No qualifying screener rows."
            onRetry={ws.retry}
            action={
              <button
                onClick={() => navigate("/dashboard/screeners")}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent-blue hover:underline"
              >
                Open Screeners <ArrowRight className="h-3.5 w-3.5" />
              </button>
            }
          >
            <VolumeLeaderList rows={data?.volume_leaders.data ?? []} catalysts={catalysts} />
          </SectionShell>

          {/* AI Pre-Market Brief (existing entitlement-enforced flow) */}
          <section className="flex min-w-0 flex-col gap-2">
            <SectionHeading
              title="AI Pre-Market Brief"
              subtitle="Server-generated brief — entitlement enforced by the backend"
            />
            <AIBriefCard
              isPro={isPro}
              config={{ ...AM_INBOX_CONFIG, aiCardTitle: "✦ AI Pre-Market Brief" }}
              briefType="am"
            />
          </section>

          {/* Catalyst Watch — prioritized stories */}
          <SectionShell
            title="Catalyst Watch"
            subtitle="Verified ticker-specific catalysts · sector news labeled separately"
            section={data?.catalyst_watch ?? null}
            loading={loading}
            emptyMessage="No provider-reported catalysts in the current window."
            onRetry={ws.retry}
            action={
              <button
                onClick={() => navigate("/dashboard/catalyst")}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent-blue hover:underline"
              >
                View Catalyst <ArrowRight className="h-3.5 w-3.5" />
              </button>
            }
          >
            <CatalystWatchList rows={catalysts} etDate={etDate} />
          </SectionShell>

          {/* Before-Open Earnings — Top 3 */}
          <SectionShell
            title="Before-Open Earnings"
            subtitle="Confirmed earnings-calendar records only · current ET date · reporting before the open"
            section={data?.earnings ?? null}
            loading={loading}
            emptyMessage="No confirmed before-open earnings-calendar events for today. Earnings-related news appears under Catalyst Watch."
            onRetry={ws.retry}
            action={
              <button
                onClick={() => navigate("/dashboard/catalyst")}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent-blue hover:underline"
              >
                Open Catalyst for the full calendar <ArrowRight className="h-3.5 w-3.5" />
              </button>
            }
          >
            <div className="flex flex-col gap-2">
              <EarningsList rows={data?.earnings.data ?? []} />
              {!!data && data.earnings_confirmed_total > (data.earnings.data.length ?? 0) && (
                <p className="text-[11px] text-muted-foreground">
                  Showing {data.earnings.data.length} of {data.earnings_confirmed_total} confirmed
                  before-open earnings events ·{" "}
                  <button
                    onClick={() => navigate("/dashboard/catalyst")}
                    className="text-accent-blue hover:underline"
                  >
                    open Catalyst for the full calendar
                  </button>
                </p>
              )}
            </div>
          </SectionShell>

          {/* Risk & Attention — Top 3 ticker groups */}
          <SectionShell
            title="Risk & Attention Flags"
            subtitle="Derived only from your watchlist signals, alerts, provider events and open journal trades"
            section={data?.risk_attention ?? null}
            loading={loading}
            emptyMessage="No attention items from currently available data."
            onRetry={ws.retry}
          >
            <RiskAttentionList
              items={data?.risk_attention.data ?? []}
              history={data?.risk_attention_history ?? []}
            />
          </SectionShell>

          {/* Watchlist — session-aware */}
          <SectionShell
            title="Watchlist Pre-Market Activity"
            subtitle="Scoreless · shown only during a confirmed pre-market session · sorted by volume"
            section={data?.watchlist_activity ?? null}
            loading={loading}
            emptyMessage={
              data?.market_context.status === "premarket"
                ? "No current pre-market analysis for your watchlist symbols."
                : data?.market_context.status === "unavailable"
                  ? "The market session cannot be confirmed, so no pre-market analysis is shown."
                  : "No pre-market session is active, so no pre-market analysis is shown."
            }
            onRetry={ws.retry}
            renderWhenEmpty={!premarketActive && !!watchlistNotice && trackedCount > 0}
            action={
              <button
                onClick={() => navigate("/dashboard/watchlist")}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent-blue hover:underline"
              >
                Open Watchlist <ArrowRight className="h-3.5 w-3.5" />
              </button>
            }
          >
            {premarketActive ? (
              <WatchlistActivityList rows={data?.watchlist_activity.data ?? []} />
            ) : watchlistNotice && trackedCount > 0 ? (
              <WatchlistSessionCompact
                notice={watchlistNotice}
                onOpen={() => navigate("/dashboard/watchlist")}
              />
            ) : (
              <WatchlistActivityList rows={data?.watchlist_activity.data ?? []} />
            )}
          </SectionShell>

          {/* Premarket-only lifecycle chips — collapsed outside pre-market */}
          {premarketActive && !loading && data && data.watchlist_lifecycle.length > 0 && (
            <div className="rounded-xl border border-dashed bg-card p-3">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Watchlist symbols without a current pre-market analysis
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.watchlist_lifecycle.map((l) => (
                  <span
                    key={l.ticker}
                    className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {l.ticker} · {l.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Opening Bell Checklist */}
          <section className="flex flex-col gap-2">
            <SectionHeading
              title="Opening Bell Checklist"
              subtitle="Generated from the data returned above · local session state"
            />
            {loading ? (
              <SectionLoading rows={1} />
            ) : !data || data.checklist.status === "unavailable" ? (
              <SectionUnavailable reason={data?.checklist.reason_code ?? "QUERY_FAILED"} onRetry={ws.retry} />
            ) : (
              <OpeningBellChecklist items={data.checklist.data} etDate={etDate} />
            )}

            {!loading && data && (
              data.journal_readiness.status === "unavailable" ? (
                <SectionUnavailable
                  reason={data.journal_readiness.reason_code ?? "QUERY_FAILED"}
                  onRetry={ws.retry}
                />

              ) : (
                <div className="rounded-xl border bg-card p-3 text-xs text-muted-foreground">
                  Journal readiness · {data.journal_readiness.data.open_trades} open{" "}
                  {data.journal_readiness.data.open_trades === 1 ? "trade" : "trades"} ·{" "}
                  {data.journal_readiness.data.missing_stop} missing a recorded stop ·{" "}
                  {data.journal_readiness.data.missing_target} missing a recorded target
                </div>
              )
            )}
          </section>

          {/* Market Headlines — Top 3 */}
          <SectionShell
            title="Market Headlines"
            subtitle="Publication time is the provider timestamp — not feed synchronization time"
            section={data?.headlines ?? null}
            loading={loading}
            emptyMessage="No headlines available."
            onRetry={ws.retry}
          >
            <HeadlinesList
              rows={data?.headlines.data ?? []}
              feedSyncAt={data?.headlines_feed_sync ?? null}
            />
          </SectionShell>

          {!loading && !data && <SectionEmpty message="Workspace data is not available yet." />}
        </>
      )}

      {/* Workflow footer */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4">
        <button
          onClick={() => navigate("/dashboard/action-center")}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
        >
          Open Action Center →
        </button>
        <button
          onClick={() => navigate("/dashboard/catalyst")}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
        >
          Open Catalyst →
        </button>
        <button
          onClick={() => navigate("/dashboard/screeners")}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
        >
          Open Screeners →
        </button>
        <button
          onClick={() => navigate("/dashboard/ai")}
          className="text-xs text-accent-blue transition-colors hover:underline"
        >
          Discuss in AI Analyst →
        </button>
      </div>
    </div>
  );
}
