import { useState } from "react";
import { Link } from "react-router-dom";
import { attentionDetailLines, groupAttentionBySymbol } from "@/lib/session-intelligence/group-attention";
import { TopNReveal } from "@/components/session-intelligence/TopNReveal";
import { etTimestampLabel } from "@/lib/pre-market/builders";
import type { PreMarketAttentionItem } from "@/types/pre-market";

export function RiskAttentionList({
  items,
  history = [],
}: {
  items: PreMarketAttentionItem[];
  history?: PreMarketAttentionItem[];
}) {
  const groups = groupAttentionBySymbol(items);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyGroups = groupAttentionBySymbol(history);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <TopNReveal items={groups}>
        {(visible) => (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((g) => {
              const lines = attentionDetailLines(g.items);
              const multi = g.items.length > 1;
              const stamp = g.items[0]?.event_time;
              const body = (
                <div className="flex h-full min-w-0 flex-col gap-1 rounded-xl border bg-card p-3 transition-colors hover:border-foreground/20">
                  <div className="break-words text-sm font-medium leading-snug">
                    {g.symbol ? (
                      multi ? (
                        <span className="font-semibold">{g.symbol}</span>
                      ) : (
                        <>
                          <span className="font-semibold">{g.symbol} · </span>
                          {g.items[0].label}
                        </>
                      )
                    ) : (
                      g.items[0].label
                    )}
                  </div>
                  {multi ? (
                    <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                      {lines.map((line, i) => (
                        <li key={g.items[i]?.id ?? `${g.key}-${i}`} className="break-words">{line}</li>
                      ))}
                    </ul>
                  ) : (
                    g.items[0].detail && (
                      <div className="break-words text-xs text-muted-foreground">{g.items[0].detail}</div>
                    )
                  )}
                  {stamp && (
                    <div className="text-[10px] text-muted-foreground">{etTimestampLabel(stamp)}</div>
                  )}
                  {g.items[0]?.source && (
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {g.items[0].source === "deterministic"
                        ? "Market condition"
                        : g.items[0].source === "verified_event"
                          ? "Verified event"
                          : g.items[0].source === "watchlist_alert"
                            ? "Watchlist alert"
                            : "System"}
                    </div>
                  )}
                </div>
              );
              return g.route ? (
                <Link key={g.key} to={g.route} className="block h-full min-w-0">
                  {body}
                </Link>
              ) : (
                <div key={g.key} className="min-w-0">{body}</div>
              );
            })}
          </div>
        )}
      </TopNReveal>
      {history.length > 0 && (
        <div>
          <button
            type="button"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((v) => !v)}
            className="min-h-8 text-xs font-medium text-accent-blue hover:underline"
          >
            {historyOpen ? "Hide alert history" : "View alert history"}
          </button>
          {historyOpen && (
            <ul className="mt-2 space-y-1 rounded-xl border bg-card p-3 text-xs text-muted-foreground">
              {historyGroups.flatMap((g) =>
                g.items.map((item) => (
                  <li key={item.id} className="break-words">
                    {item.symbol ? `${item.symbol} · ` : ""}
                    {item.label}
                    {item.detail ? ` — ${item.detail}` : ""}
                    {item.event_time ? ` · ${etTimestampLabel(item.event_time)}` : ""}
                  </li>
                )),
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
