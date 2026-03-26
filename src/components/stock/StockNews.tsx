import { useState } from "react";
import { cn } from "@/lib/utils";

const NEWS_FILTERS = ["All", "Videos", "Press", "Conversation"] as const;
const VIDEO_SOURCES = ["youtube", "cnbc"];
const PRESS_SOURCES = ["globenewswire", "businesswire", "prnewswire", "pr newswire"];

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
        <div className="space-y-2">
          {filtered.map((n: any, i: number) => (
            <a
              key={i}
              href={n.article_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-accent-blue hover:underline"
            >
              {n.title}
              <span className="text-xs text-muted-foreground ml-2">— {n.publisher?.name}</span>
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
