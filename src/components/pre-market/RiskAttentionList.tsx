import { useState } from "react";
import { Link } from "react-router-dom";
import { attentionDetailLines, groupAttentionBySymbol } from "@/lib/session-intelligence/group-attention";
import { TopNReveal } from "@/components/session-intelligence/TopNReveal";
import { etTimestampLabel } from "@/lib/pre-market/builders";
import type { PreMarketAttentionItem } from "@/types/pre-market";

function sourceLabel(source: PreMarketAttentionItem["source"]): string | null {
  if (source === "deterministic") return "Market condition";
  if (source === "verified_event") return "Verified event";
  if (source === "watchlist_alert") return "Watchlist alert";
  if (source === "system") return "System";
  return null;
}

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
    <div className="flex min-w-0 max-w-full flex-col gap-2 overflow-x-hidden">
      <TopNReveal items={groups} mode="view-more" className="min-w-0 max-w-full overflow-x-hidden">
        {(visible) => (
          <div className="min-w-0 max-w-full overflow-hidden rounded-xl border bg-card">
            {visible.map((g) => {
              const lines = attentionDetailLines(g.items);
              const multi = g.items.length > 1;
              const stamp = g.items[0]?.event_time;
              const source = sourceLabel(g.items[0]?.source);
              const body = (
                <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
                  <div className="min-w-0 break-words text-sm font-medium leading-snug">
                    {g.symbol ? (
                      multi ? (
                        <span className="font-semibold">{g.symbol}</span>
                      ) : (
                        <>
                          <span className="font-semibold">{g.symbol}</span>
                          <span className="font-normal"> · {g.items[0].label}</span>
                        </>
                      )
                    ) : (
                      g.items[0].label
                    )}
                  </div>
                  {multi ? (
                    <ul className="min-w-0 list-disc space-y-0.5 pl-4 text-xs leading-snug text-muted-foreground">
                      {lines.map((line, i) => (
                        <li key={g.items[i]?.id ?? `${g.key}-${i}`} className="min-w-0 break-words">
                          {line}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    g.items[0].detail && (
                      <div className="min-w-0 break-words text-xs leading-snug text-muted-foreground">
                        {g.items[0].detail}
                      </div>
                    )
                  )}
                  {(stamp || source) && (
                    <div className="min-w-0 truncate text-[10px] text-muted-foreground">
                      {stamp ? etTimestampLabel(stamp) : ""}
                      {stamp && source ? " · " : ""}
                      {source}
                    </div>
                  )}
                </div>
              );
              return g.route ? (
                <Link
                  key={g.key}
                  to={g.route}
                  className="block min-w-0 max-w-full border-b border-border last:border-b-0 hover:bg-muted/40"
                >
                  {body}
                </Link>
              ) : (
                <div key={g.key} className="min-w-0 max-w-full border-b border-border last:border-b-0">
                  {body}
                </div>
              );
            })}
          </div>
        )}
      </TopNReveal>
      {history.length > 0 && (
        <div className="min-w-0">
          <button
            type="button"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((v) => !v)}
            className="min-h-8 text-xs font-medium text-accent-blue hover:underline"
          >
            {historyOpen ? "Hide alert history" : "View alert history"}
          </button>
          {historyOpen && (
            <ul className="mt-1 max-w-full space-y-1 overflow-hidden rounded-xl border bg-card p-3 text-xs text-muted-foreground">
              {historyGroups.flatMap((g) =>
                g.items.map((item) => (
                  <li key={item.id} className="min-w-0 break-words">
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
