import { ExternalLink } from "lucide-react";
import { categoryLabel, categoryStyle, timeAgo } from "@/config/news-feed.config";

export interface NewsFeedItem {
  id: string;
  headline: string;
  source: string | null;
  url: string | null;
  category: string | null;
  published_at: string | null;
  image_url: string | null;
  description: string | null;
  publisher_favicon: string | null;
}

interface Props {
  items: NewsFeedItem[];
}

export default function DashboardNewsList({ items }: Props) {
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item) => {
        const href = item.url ?? "#";
        const hasLink = Boolean(item.url);
        return (
          <a
            key={item.id}
            href={href}
            target={hasLink ? "_blank" : undefined}
            rel={hasLink ? "noopener noreferrer" : undefined}
            className="group flex gap-3 rounded-lg border border-border bg-surface-card p-3 sm:p-4 hover:border-accent-blue/40 hover:bg-card/80 transition-colors"
          >
            {item.image_url && (
              <img
                src={item.image_url}
                alt=""
                loading="lazy"
                className="hidden sm:block h-20 w-28 md:h-24 md:w-36 rounded-md object-cover bg-muted flex-shrink-0"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm sm:text-[15px] font-medium text-foreground line-clamp-2 group-hover:text-accent-blue transition-colors">
                  {item.headline}
                </h3>
                <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5 group-hover:text-accent-blue transition-colors" />
              </div>
              {item.description && (
                <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                  {item.description}
                </p>
              )}
              <div className="flex items-center gap-2 text-[11px] sm:text-xs text-muted-foreground flex-wrap pt-0.5">
                {item.category && (
                  <span className={`px-2 py-0.5 rounded-full border ${categoryStyle(item.category)}`}>
                    {categoryLabel(item.category)}
                  </span>
                )}
                <div className="flex items-center gap-1.5 min-w-0">
                  {item.publisher_favicon && (
                    <img
                      src={item.publisher_favicon}
                      alt=""
                      loading="lazy"
                      className="h-3.5 w-3.5 rounded-sm object-cover flex-shrink-0"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                  {item.source && <span className="truncate">{item.source}</span>}
                </div>
                {item.published_at && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{timeAgo(item.published_at)}</span>
                  </>
                )}
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
