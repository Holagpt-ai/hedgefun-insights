import { useMemo, useState } from "react";
import type { PaperTraderSession } from "@/lib/execution/runtime/paper-trader-session";
import {
  buildSymbolTimeline,
  computeRejectionBreakdown,
  computeSessionSummary,
  computeSetupBreakdown,
  listMissedOpportunities,
  symbolsForTimeline,
} from "@/lib/execution/observation/session-review";

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

interface Props {
  session: PaperTraderSession;
}

export function AiTraderSessionReview({ session }: Props) {
  const shadows = session.getShadowRecords();
  const account = session.getAccount();
  const events = session.getAllEvents();

  const summary = useMemo(() => computeSessionSummary(shadows, account), [shadows, account]);
  const rejections = useMemo(() => computeRejectionBreakdown(shadows), [shadows]);
  const setups = useMemo(() => computeSetupBreakdown(shadows), [shadows]);
  const misses = useMemo(() => listMissedOpportunities(shadows), [shadows]);
  const symbols = useMemo(() => symbolsForTimeline(events, shadows), [events, shadows]);
  const [timelineSymbol, setTimelineSymbol] = useState<string>("");
  const activeSymbol = timelineSymbol || symbols[0] || "";
  const timeline = useMemo(
    () => (activeSymbol ? buildSymbolTimeline(activeSymbol, events, shadows) : []),
    [activeSymbol, events, shadows],
  );

  return (
    <section className="rounded-lg border border-border bg-surface-card p-4 space-y-5">
      <div>
        <h2 className="text-sm font-semibold">Session review</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Local shadow session — preserved in {`stocksist-paper-trader-v1`} across refresh.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
        {[
          ["Opportunities", String(summary.opportunities)],
          ["Risk approved", String(summary.approved)],
          ["Rejected", String(summary.rejected)],
          ["Paper trades", String(summary.paperTrades)],
          ["Win rate", summary.winRate != null ? `${Math.round(summary.winRate * 100)}%` : "—"],
          ["Wins", String(summary.wins)],
          ["Losses", String(summary.losses)],
          ["Realized P&L", fmtMoney(summary.realizedPnl)],
          ["Unrealized P&L", fmtMoney(summary.unrealizedPnl)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-border/60 px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="font-medium mt-0.5 tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div>
          <h3 className="text-xs font-semibold mb-2">Rejection breakdown</h3>
          {rejections.length === 0 ? (
            <p className="text-xs text-muted-foreground">No rejection reasons recorded yet.</p>
          ) : (
            <ul className="text-xs space-y-1">
              {rejections.map((row) => (
                <li key={row.code} className="flex justify-between gap-2 border-b border-border/40 py-1">
                  <span>{row.label}</span>
                  <span className="tabular-nums font-medium">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold mb-2">Setup breakdown</h3>
          {setups.length === 0 ? (
            <p className="text-xs text-muted-foreground">No setups recorded yet.</p>
          ) : (
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-[11px] min-w-[420px]">
                <thead>
                  <tr className="text-muted-foreground text-left">
                    <th className="py-1 pr-2">Setup</th>
                    <th className="py-1 pr-2">Opps</th>
                    <th className="py-1 pr-2">Approved</th>
                    <th className="py-1 pr-2">Paper</th>
                    <th className="py-1 pr-2">W/L</th>
                    <th className="py-1">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {setups.map((row) => (
                    <tr key={row.setupKey} className="border-t border-border/50">
                      <td className="py-1 pr-2 font-medium">{row.setupKey}</td>
                      <td className="py-1 pr-2 tabular-nums">{row.opportunities}</td>
                      <td className="py-1 pr-2 tabular-nums">{row.approved}</td>
                      <td className="py-1 pr-2 tabular-nums">{row.paperTrades}</td>
                      <td className="py-1 pr-2 tabular-nums">{row.wins}/{row.losses}</td>
                      <td className="py-1 tabular-nums">{fmtMoney(row.realizedPnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold mb-2">Misses (detected but not entered)</h3>
        {misses.length === 0 ? (
          <p className="text-xs text-muted-foreground">No rejected opportunities in this session.</p>
        ) : (
          <ul className="text-xs space-y-2 max-h-40 overflow-y-auto">
            {misses.slice(0, 25).map((row) => (
              <li key={`${row.symbol}-${row.recordedAt}`} className="border-b border-border/40 pb-1">
                <span className="font-medium">{row.symbol}</span>
                <span className="text-muted-foreground"> · {fmtTime(row.recordedAt)} · {row.setupKey}</span>
                <div className="text-muted-foreground">{row.rejectionLabels.join(" · ") || row.status}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h3 className="text-xs font-semibold">Symbol timeline</h3>
          {symbols.length > 0 && (
            <select
              className="text-xs rounded border border-border bg-background px-2 py-1"
              value={activeSymbol}
              onChange={(e) => setTimelineSymbol(e.target.value)}
              aria-label="Symbol for timeline"
            >
              {symbols.map((sym) => (
                <option key={sym} value={sym}>{sym}</option>
              ))}
            </select>
          )}
        </div>
        {timeline.length === 0 ? (
          <p className="text-xs text-muted-foreground">Select a symbol once events are recorded.</p>
        ) : (
          <ol className="text-xs space-y-1 max-h-48 overflow-y-auto font-mono">
            {timeline.map((entry, i) => (
              <li key={`${entry.timestamp}-${entry.label}-${i}`} className="flex gap-2">
                <span className="text-muted-foreground shrink-0">{fmtTime(entry.timestamp)}</span>
                <span>{entry.label}</span>
                {entry.detail ? <span className="text-muted-foreground truncate">— {entry.detail}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
