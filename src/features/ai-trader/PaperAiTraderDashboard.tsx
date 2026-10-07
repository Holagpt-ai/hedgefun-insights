import { Bot, ExternalLink, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { workflowSymbolRoutes } from "@/lib/historical-workflow/workflow-symbol-routes";
import { usePaperTraderDashboard } from "@/hooks/usePaperTraderDashboard";
import type { ExecutionMode } from "@/lib/execution/execution-mode";
import {
  formatOpportunityIntelLine,
  formatRejectionSummary,
} from "@/features/ai-trader/opportunity-display";
import type { ShadowOpportunityRecord } from "@/lib/execution/shadow/shadow-opportunity";

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function SymbolLinks({ symbol }: { symbol: string }) {
  const routes = workflowSymbolRoutes(symbol);
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <Link className="text-accent-blue hover:underline inline-flex items-center gap-0.5" to={routes.ai}>
        AI Analyst <ExternalLink className="h-3 w-3" />
      </Link>
      <Link className="text-accent-blue hover:underline" to={`/dashboard/screeners?symbol=${encodeURIComponent(symbol)}`}>
        Radar
      </Link>
      <Link className="text-accent-blue hover:underline" to={routes.catalyst}>Catalyst</Link>
      <Link className="text-accent-blue hover:underline" to={routes.watchlist}>Watchlist</Link>
      <Link className="text-accent-blue hover:underline" to={routes.journal}>Journal</Link>
    </div>
  );
}

function modeLabel(mode: ExecutionMode): string {
  if (mode === "paper") return "PAPER MODE";
  return "OBSERVE MODE";
}

function modeHint(mode: ExecutionMode, executionEnabled: boolean): string {
  if (mode === "observe") {
    return "Observe mode logs radar opportunities and risk decisions without entering paper trades.";
  }
  if (!executionEnabled) {
    return "Paper mode is selected — turn the paper engine on to simulate entries when signals pass risk.";
  }
  return "Paper mode is active — approved signals can create simulated positions (live broker remains disabled).";
}

function OpportunityMobileCard({ row }: { row: ShadowOpportunityRecord }) {
  const move = row.signal.metadata?.move_pct as number | null | undefined;
  const intel = formatOpportunityIntelLine(row.signal);
  const risk = formatRejectionSummary(row.rejectionReasons);
  return (
    <div className="rounded-md border border-border/70 p-3 space-y-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-sm">{row.signal.symbol}</div>
          <div className="text-muted-foreground truncate max-w-[220px]" title={row.signal.thesisSummary ?? undefined}>
            {row.signal.eventType ?? row.signal.thesisSummary ?? "—"}
          </div>
        </div>
        <div className="text-right tabular-nums">
          <div>{row.signal.triggerPrice.toFixed(2)}</div>
          <div className={move != null && move >= 0 ? "text-emerald-600" : "text-red-600"}>{fmtPct(move ?? null)}</div>
        </div>
      </div>
      <p className="text-muted-foreground leading-snug">{intel}</p>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-muted-foreground">
        <span>Vol / RVOL</span>
        <span className="text-foreground tabular-nums">
          {row.signal.volume?.toLocaleString() ?? "—"} / {row.signal.rvol?.toFixed(1) ?? "—"}
        </span>
        <span>Stop / target</span>
        <span className="text-foreground tabular-nums">
          {row.plan.stopLossPrice?.toFixed(2) ?? "—"} / {row.plan.profitTargetPrice?.toFixed(2) ?? "—"}
        </span>
        <span>Risk</span>
        <span className="text-foreground">{risk}</span>
        <span>Paper</span>
        <span className="text-foreground">{row.status}</span>
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-muted-foreground">{fmtTime(row.signal.signalAt)}</span>
        <SymbolLinks symbol={row.signal.symbol} />
      </div>
    </div>
  );
}

export function PaperAiTraderDashboard() {
  const {
    session,
    mode,
    executionEnabled,
    setMode,
    setExecutionEnabled,
    resetSession,
    activateKillSwitch,
    screenerStatus,
    tick,
  } = usePaperTraderDashboard();

  void tick;

  const account = session.getAccount();
  const stats = session.getStatistics();
  const shadows = session.getShadowRecords();
  const events = session.getRecentEvents(30);
  const limits = session.getRiskLimits();
  const ksActive = session.killSwitchStore.getActivations().length > 0;
  const dailyLossBreached = account.realizedPnl <= -limits.maxDailyLoss;

  const confirmReset = () => {
    if (window.confirm("Reset paper account, shadow history, and local session storage?")) {
      resetSession();
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Bot className="h-5 w-5 text-accent-blue" />
            <h1 className="text-xl md:text-2xl font-semibold text-foreground">AI Trader</h1>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300">
              {modeLabel(mode)}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">
              Live trading disabled
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Shadow-first paper execution. Day Trade Radar rows feed opportunities through deterministic risk — no live broker.
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Radar feed: {screenerStatus === "available" ? "connected" : screenerStatus}
          </p>
          <p className="text-xs text-muted-foreground mt-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 max-w-2xl">
            {modeHint(mode, executionEnabled)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button variant={mode === "observe" ? "default" : "outline"} size="sm" onClick={() => setMode("observe")}>
            Observe
          </Button>
          <Button variant={mode === "paper" ? "default" : "outline"} size="sm" onClick={() => setMode("paper")}>
            Paper
          </Button>
          <Button
            variant={executionEnabled ? "secondary" : "outline"}
            size="sm"
            onClick={() => setExecutionEnabled(!executionEnabled)}
          >
            {executionEnabled ? "Paper engine ON" : "Paper engine OFF"}
          </Button>
          <Button variant="outline" size="sm" onClick={confirmReset}>
            Reset session
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {[
          ["Paper equity", fmtMoney(account.equity)],
          ["Cash", fmtMoney(account.cash)],
          ["Buying power", fmtMoney(account.buyingPower)],
          ["Realized P&L", fmtMoney(account.realizedPnl)],
          ["Unrealized P&L", fmtMoney(account.unrealizedPnl)],
          ["Open positions", String(stats.openPositionCount)],
          ["Win rate", stats.winRate != null ? `${Math.round(stats.winRate * 100)}%` : "—"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-surface-card px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-1 text-sm font-medium">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 rounded-lg border border-border bg-surface-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Opportunities</h2>
          {shadows.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">
              No opportunities yet. Waiting for Day Trade Radar signals.
            </p>
          )}
          <div className="md:hidden space-y-2">
            {shadows.map((row) => (
              <OpportunityMobileCard key={row.recordedAt + row.signal.id} row={row} />
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto -mx-1 px-1">
            <table className="w-full text-xs min-w-[860px]">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <th className="py-1 pr-2">Symbol</th>
                  <th className="py-1 pr-2">Setup / intel</th>
                  <th className="py-1 pr-2">Price</th>
                  <th className="py-1 pr-2">Move</th>
                  <th className="py-1 pr-2">Vol / RVOL</th>
                  <th className="py-1 pr-2">Stop / target</th>
                  <th className="py-1 pr-2">Risk</th>
                  <th className="py-1 pr-2">Paper</th>
                  <th className="py-1 pr-2">Time</th>
                  <th className="py-1">Links</th>
                </tr>
              </thead>
              <tbody>
                {shadows.map((row) => {
                  const move = row.signal.metadata?.move_pct as number | null | undefined;
                  const intel = formatOpportunityIntelLine(row.signal);
                  const risk = formatRejectionSummary(row.rejectionReasons);
                  return (
                    <tr key={row.recordedAt + row.signal.id} className="border-t border-border/60 align-top">
                      <td className="py-2 pr-2 font-medium">{row.signal.symbol}</td>
                      <td className="py-2 pr-2 max-w-[220px]">
                        <div className="truncate" title={row.signal.thesisSummary ?? undefined}>
                          {row.signal.eventType ?? row.signal.thesisSummary ?? "—"}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{intel}</div>
                      </td>
                      <td className="py-2 pr-2 tabular-nums">{row.signal.triggerPrice.toFixed(2)}</td>
                      <td className="py-2 pr-2 tabular-nums">{fmtPct(move ?? null)}</td>
                      <td className="py-2 pr-2 tabular-nums">
                        {row.signal.volume?.toLocaleString() ?? "—"} / {row.signal.rvol?.toFixed(1) ?? "—"}
                      </td>
                      <td className="py-2 pr-2 tabular-nums">
                        {row.plan.stopLossPrice?.toFixed(2) ?? "—"} / {row.plan.profitTargetPrice?.toFixed(2) ?? "—"}
                      </td>
                      <td className="py-2 pr-2 max-w-[160px]" title={risk}>
                        <span className="line-clamp-2">{risk}</span>
                      </td>
                      <td className="py-2 pr-2">{row.status}</td>
                      <td className="py-2 pr-2 whitespace-nowrap">{fmtTime(row.signal.signalAt)}</td>
                      <td className="py-2"><SymbolLinks symbol={row.signal.symbol} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface-card p-4 space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-1"><ShieldAlert className="h-4 w-4" /> Risk</h2>
          <ul className="text-xs space-y-1 text-muted-foreground">
            <li>Mode: <span className="text-foreground">{mode}</span></li>
            <li>Execution: <span className="text-foreground">{executionEnabled ? "enabled" : "disabled"}</span></li>
            <li>Kill switch: <span className="text-foreground">{ksActive ? "ACTIVE" : "off"}</span></li>
            <li>Max trade: <span className="text-foreground">{fmtMoney(limits.maxTradeNotional)}</span></li>
            <li>Max position: <span className="text-foreground">{fmtMoney(limits.maxPositionNotional)}</span></li>
            <li>Max exposure: <span className="text-foreground">{fmtMoney(limits.maxPortfolioExposure)}</span></li>
            <li>Open positions: <span className="text-foreground">{stats.openPositionCount} / {limits.maxOpenPositions}</span></li>
            <li>Daily loss: <span className="text-foreground">{dailyLossBreached ? "limit hit" : "ok"}</span></li>
            <li>Live confirm / autonomous: blocked</li>
          </ul>
          <Button size="sm" variant="destructive" className="w-full" onClick={activateKillSwitch}>
            Activate kill switch
          </Button>
        </section>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="rounded-lg border border-border bg-surface-card p-4">
          <h2 className="text-sm font-semibold mb-2">Open paper positions</h2>
          {account.openPositions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No open paper positions.</p>
          ) : (
            account.openPositions.map((p) => (
              <div key={p.symbol} className="text-xs border-t border-border/60 py-2 space-y-1">
                <div className="font-medium">{p.symbol} · {p.quantity} @ {p.averageEntryPrice.toFixed(2)}</div>
                <div>Current {p.currentPrice.toFixed(2)} · P&L {fmtMoney(p.unrealizedPnl)}</div>
                <div>Stop {p.stopLossPrice ?? "—"} · Target {p.profitTargetPrice ?? "—"}</div>
                <SymbolLinks symbol={p.symbol} />
              </div>
            ))
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface-card p-4">
          <h2 className="text-sm font-semibold mb-2">Recent trades</h2>
          {account.closedTrades.length === 0 ? (
            <p className="text-xs text-muted-foreground">No closed trades yet.</p>
          ) : (
            account.closedTrades.slice(-8).reverse().map((t) => (
              <div key={t.closedAt + t.symbol} className="text-xs border-t border-border/60 py-2">
                {t.symbol} · {t.entryPrice.toFixed(2)} → {t.exitPrice.toFixed(2)} · {fmtMoney(t.realizedPnl)} · {t.exitReason} · {fmtTime(t.closedAt)}
              </div>
            ))
          )}
        </section>
      </div>

      <section className="rounded-lg border border-border bg-surface-card p-4">
        <h2 className="text-sm font-semibold mb-2">Event feed</h2>
        <ul className="text-xs space-y-1 max-h-48 overflow-y-auto">
          {events.length === 0 && <li className="text-muted-foreground">No events yet.</li>}
          {events.map((e) => (
            <li key={e.eventId} className="text-muted-foreground">
              <span className="text-foreground">{e.eventType}</span>
              {e.symbol ? ` · ${e.symbol}` : ""}
              {e.reasonCodes.length ? ` · ${e.reasonCodes.join(",")}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
