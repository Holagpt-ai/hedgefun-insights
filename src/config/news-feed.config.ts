// News Feed dashboard config — mirrors visual language of NewsSection without importing it.

export type NewsCategoryValue = "all" | "markets" | "stocks" | "ipo" | "etf" | "general";

export interface NewsCategory {
  value: NewsCategoryValue;
  label: string;
  colorClass: string; // used for badge
}

export const NEWS_CATEGORIES: NewsCategory[] = [
  { value: "all",      label: "All",      colorClass: "bg-muted text-muted-foreground border-border" },
  { value: "markets",  label: "Markets",  colorClass: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  { value: "stocks",   label: "Stocks",   colorClass: "bg-green-500/10 text-green-500 border-green-500/20" },
  { value: "ipo",      label: "IPO",      colorClass: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
  { value: "etf",      label: "ETF",      colorClass: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  { value: "general",  label: "General",  colorClass: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20" },
];

export const NEWS_FEED_LIMIT = 50;

export const NEWS_FEED_COPY = {
  title: "News Feed",
  subtitle: "Market headlines from trusted sources, organized for your trading workflow.",
  trustBanner:
    "Headlines may be delayed and are provided by third-party sources. Verify details at the original source before making trading decisions.",
  footerDisclaimer:
    "News is provided for market awareness only. Not financial advice. Verify all information at the source.",
};

export function categoryStyle(category: string | null | undefined): string {
  const key = (category ?? "general").toLowerCase();
  return (
    NEWS_CATEGORIES.find((c) => c.value === key)?.colorClass ??
    NEWS_CATEGORIES.find((c) => c.value === "general")!.colorClass
  );
}

export function categoryLabel(category: string | null | undefined): string {
  const key = (category ?? "general").toLowerCase();
  return NEWS_CATEGORIES.find((c) => c.value === key)?.label ?? "General";
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${Math.max(diff, 1)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
