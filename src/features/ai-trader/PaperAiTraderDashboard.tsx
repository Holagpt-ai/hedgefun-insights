import { useEffect, useState } from "react";
import { Bot, ExternalLink, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PaperTraderSession } from "@/lib/execution/runtime/paper-trader-session";
import type { ExecutionMode } from "@/lib/execution/execution-mode";
import { workflowSymbolRoutes } from "@/lib/historical-workflow/workflow-symbol-routes";
import type { StocksistSignal } from "@/lib/execution/signal/stocksist-signal";

const DEMO_SIGNAL: StocksistSignal = {
  id: "demo-grml-1",
  symbol: "GRML",
  strategyId: "CATALYST_MOMENTUM_V1",
  side: "buy",
  triggerPrice: 12.4,
  suggestedQuantity: 25,
  suggestedNotional: null,
  stopLossPrice: 11.9,
  profitTargetPrice: 13.2,
  eventType: "MOMENTUM_BREAKOUT",
  catalystId: "demo-catalyst",
  volume: 2_400_000,
  rvol: 4.1,
  momentumScore: 0.86,
  aboveVwap: true,
  hodProximityPct: 0.15,
  floatTurnover: 0.42,
  historicalContext: "Repeat mover — 3 prior episodes",
  thesisSummary: "Verified catalyst + volume acceleration above VWAP",
  signalAt: new Date().toISOString(),
  metadata: { demo: true },
};

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function SymbolLinks({ symbol }: { symbol: string }) {
  const routes = workflowSymbolRoutes(symbol);
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <Link className="text-accent-blue hover:underline inline-flex items-center gap-0.5" to={routes.ai}>
        AI Analyst <ExternalLink className="h-3 w-3" />
      </Link>
      <Link className="text-accent-blue hover:underline" to={routes.catalyst}>Catalyst</Link>
      <Link className="text-accent-blue hover:underline" to="/dashboard/screeners">Radar</Link>
      <Link className="text-accent-blue hover:underline" to={routes.watchlist}>Watchlist</Link>
      <Link className="text-accent-blue hover:underline" to={routes.journal}>Journal</Link>
    </div>
  );
}

export function PaperAiTraderDashboard() {
  const [session] = useState(() => new PaperTraderSession({ startingCash: 100_000 }));
  const [mode, setMode] = useState<ExecutionMode>("observe");
  const [enabled, setEnabled] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    session.setMode(mode);
    session.setExecutionEnabled(enabled);
  }, [session, mode, enabled]);

  const account = session.getAccount();
  const stats = session.getStatistics();
  const shadows = session.getShadowRecords();
  const events = session.getRecentEvents(20);
  const ksActive = session.killSwitchStore.getActivations().length > 0;

  const runDemoSignal = async () => {
    await session.processSignal({ ...DEMO_SIGNAL, id: `demo-${Date.now()}`, signalAt: new Date().toISOString() });
    setTick((t) => t + 1);
  };

  const markDemoPrice = async (price: number) => {
    await session.processPriceTick({ GRML: price });
    setTick((t) => t + 1);
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Bot className="h-5 w-5 text-accent-blue" />
            <h1 className="text-xl md:text-2xl font-semibold text-foreground">AI Trader</h1>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300">
              {mode === "paper" ? "Paper trading" : "Observe mode"}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">
              Live trading disabled
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Simulated execution only. Signals pass through deterministic risk before any paper fill.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={mode === "observe" ? "default" : "outline"} size="sm" onClick={() => setMode("observe")}>
            Observe
          </Button>
          <Button variant={mode === "paper" ? "default" : "outline"} size="sm" onClick={() => setMode("paper")}>
            Paper
          </Button>
          <Button variant={enabled ? "secondary" : "outline"} size="sm" onClick={() => setEnabled((e) => !e)}>
            {enabled ? "Execution ON" : "Execution OFF"}
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
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Live / shadow opportunities</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void runDemoSignal()}>Ingest demo signal</Button>
              <Button size="sm" variant="ghost" onClick={() => void markDemoPrice(11.8)}>Mark GRML 11.8</Button>
              <Button size="sm" variant="ghost" onClick={() => void markDemoPrice(13.3)}>Mark GRML 13.3</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <th className="py-1 pr-2">Symbol</th>
                  <th className="py-1 pr-2">Setup</th>
                  <th className="py-1 pr-2">Risk</th>
                  <th className="py-1 pr-2">Status</th>
                  <th className="py-1">Links</th>
                </tr>
              </thead>
              <tbody>
                {shadows.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-muted-foreground">No opportunities recorded yet.</td></tr>
                )}
                {shadows.map((row) => (
                  <tr key={row.recordedAt + row.signal.id} className="border-t border-border/60">
                    <td className="py-2 pr-2 font-medium">{row.signal.symbol}</td>
                    <td className="py-2 pr-2">{row.signal.thesisSummary ?? row.signal.eventType}</td>
                    <td className="py-2 pr-2">{row.rejectionReasons.join(", ") || "APPROVED"}</td>
                    <td className="py-2 pr-2">{row.status}</td>
                    <td className="py-2"><SymbolLinks symbol={row.signal.symbol} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface-card p-4 space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-1"><ShieldAlert className="h-4 w-4" /> Risk panel</h2>
          <ul className="text-xs space-y-1 text-muted-foreground">
            <li>Mode: <span className="text-foreground">{mode}</span></li>
            <li>System: <span className="text-foreground">{enabled ? "enabled" : "disabled"}</span></li>
            <li>Kill switch: <span className="text-foreground">{ksActive ? "ACTIVE" : "off"}</span></li>
            <li>Max trade / position / exposure enforced by RiskGateway</li>
            <li>Live confirm / autonomous: blocked</li>
          </ul>
          <Button
            size="sm"
            variant="destructive"
            className="w-full"
            onClick={() => {
              session.killSwitchStore.activate({
                scope: "GLOBAL",
                strategyId: null,
                symbol: null,
                semantics: ["BLOCK_NEW_ENTRIES"],
                activatedAt: new Date().toISOString(),
                reason: "operator",
              });
              setTick((t) => t + 1);
            }}
          >
            Activate kill switch (demo)
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
                <div>Mark {p.currentPrice.toFixed(2)} · P&L {fmtMoney(p.unrealizedPnl)}</div>
                <div>Stop {p.stopLossPrice ?? "—"} · Target {p.profitTargetPrice ?? "—"}</div>
                <SymbolLinks symbol={p.symbol} />
              </div>
            ))
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface-card p-4">
          <h2 className="text-sm font-semibold mb-2">Recent paper trades</h2>
          {account.closedTrades.length === 0 ? (
            <p className="text-xs text-muted-foreground">No closed trades yet.</p>
          ) : (
            account.closedTrades.slice(-5).reverse().map((t) => (
              <div key={t.closedAt + t.symbol} className="text-xs border-t border-border/60 py-2">
                {t.symbol} {t.quantity} · {t.entryPrice.toFixed(2)} → {t.exitPrice.toFixed(2)} · {fmtMoney(t.realizedPnl)} · {t.exitReason}
              </div>
            ))
          )}
        </section>
      </div>

      <section className="rounded-lg border border-border bg-surface-card p-4">
        <h2 className="text-sm font-semibold mb-2">Event / decision feed</h2>
        <ul className="text-xs space-y-1 max-h-48 overflow-y-auto">
          {events.map((e) => (
            <li key={e.eventId} className="text-muted-foreground">
              <span className="text-foreground">{e.eventType}</span>
              {e.symbol ? ` · ${e.symbol}` : ""}
              {e.reasonCodes.length ? ` · ${e.reasonCodes.join(",")}` : ""}
            </li>
          ))}
        </ul>
      </section>
      <span className="sr-only" aria-hidden>{tick}</span>
    </div>
  );
}
