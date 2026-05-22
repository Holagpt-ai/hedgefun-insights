import { useState } from "react";
import { cn } from "@/lib/utils";

const NEWS_FILTERS = ["All", "Videos", "Press", "Conversation"] as const;
const VIDEO_SOURCES = ["youtube", "cnbc"];
const PRESS_SOURCES = ["globenewswire", "businesswire", "prnewswire", "pr newswire"];

function formatRelativeTime(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return "yesterday";
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function classifyNews(items: any[], filter: string): any[] {
  if (filter === "All") return items;
  const matchSource = (name: string, sources: string[]) =>
    sources.some((s) => name.toLowerCase().includes(s));
  if (filter === "Videos") return items.filter((n) => matchSource(n.publisher?.name ?? "", VIDEO_SOURCES));
  if (filter === "Press") return items.filter((n) => matchSource(n.publisher?.name ?? "", PRESS_SOURCES));
  return items.filter((n) => {
    const name = n.publisher?.name ?? "";
    return !matchSource(name, VIDEO_SOURCES) && !matchSource(name, PRESS_SOURCES);
  });
}

interface Props {
  news: any;
}

export default function StockNews({ news }: Props) {
  const [filter, setFilter] = useState<string>("All");
  const items = Array.isArray(news) ? news : [];
  const filtered = classifyNews(items, filter);

  if (items.length === 0) return null;

  return (
    <div>
      <h3 className="text-base font-bold text-foreground mb-3">Recent News</h3>

      {/* Filter pills */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {NEWS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "text-[0.8125rem] px-3 py-1 rounded-full transition-colors",
              filter === f
                ? "bg-foreground text-background"
                : "bg-muted border border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length > 0 ? (
        <div className="divide-y divide-border">
          {filtered.map((n: any, i: number) => (
            <a
              key={i}
              href={n.article_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-3 py-3 group hover:bg-muted/30 transition-colors duration-200 rounded px-2 -mx-2"
            >
              <div className="relative shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded overflow-hidden bg-muted">
                {n.image_url ? (
                  <img
                    src={n.image_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = "none";
                      const fallback = target.nextElementSibling as HTMLElement | null;
                      if (fallback) fallback.style.display = "flex";
                    }}
                  />
                ) : null}
                <div
                  className="absolute inset-0 items-center justify-center bg-muted text-muted-foreground text-lg font-semibold"
                  style={{ display: n.image_url ? "none" : "flex" }}
                >
                  {n.publisher?.favicon_url ? (
                    <img
                      src={n.publisher.favicon_url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-6 h-6"
                    />
                  ) : (
                    <span>{(n.publisher?.name ?? "?").charAt(0)}</span>
                  )}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1 truncate">
                  {n.publisher?.favicon_url && (
                    <img
                      src={n.publisher.favicon_url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-3.5 h-3.5 shrink-0"
                    />
                  )}
                  <span className="truncate">{n.publisher?.name}</span>
                  {n.published_utc && (
                    <>
                      <span>·</span>
                      <span className="shrink-0">{formatRelativeTime(n.published_utc)}</span>
                    </>
                  )}
                </div>

                <div className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-accent-blue transition-colors">
                  {n.title}
                </div>

                {n.description && (
                  <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                    {n.description}
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {filter === "Videos" ? "No video content available" : `No ${filter.toLowerCase()} articles found`}
        </p>
      )}
    </div>
  );
}
