import type { ActionFeedItem, FeedBucket } from "@/types/action-center";
import { SymbolActions } from "./SymbolActions";

const BUCKET_LABEL: Record<FeedBucket, string> = {
  now: "Now",
  today: "Today",
  upcoming: "Upcoming",
  open_position: "Open Position",
};

const BUCKET_ORDER: FeedBucket[] = ["now", "today", "upcoming", "open_position"];

export function ActionFeed({ items }: { items: ActionFeedItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        No qualifying items right now. New Watchlist alerts, saved Catalyst events, upcoming
        catalysts, and open trades will appear here as they occur.
      </div>
    );
  }
  const grouped = BUCKET_ORDER.map((b) => ({ bucket: b, items: items.filter((i) => i.bucket === b) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      {grouped.map((g) => (
        <div key={g.bucket}>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {BUCKET_LABEL[g.bucket]} · {g.items.length}
          </div>
          <ul className="divide-y rounded-xl border bg-card overflow-hidden">
            {g.items.map((it) => (
              <li key={it.key} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="sm:w-32 shrink-0">
                  <div className="font-bold text-sm">{it.symbol}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {it.sourceLabel}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{it.title}</div>
                  {it.detail && (
                    <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{it.detail}</div>
                  )}
                  <div className="text-[11px] text-muted-foreground mt-1">{it.timestampLabel}</div>
                </div>
                <div className="sm:w-auto">
                  <SymbolActions
                    symbol={it.symbol}
                    showWatchlist={it.source === "watchlist_alert"}
                    showChart
                    sourceUrl={it.sourceUrl}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
