import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { getEffectiveLanguage } from "@/config/locale-v1.policy";
import { homepageV21Copy, type HomepageV21Lang } from "@/lib/homepage/homepage-v21-copy";

type MarketNewsRow = {
  id: string;
  headline: string;
  description: string | null;
  source: string | null;
  publisher_favicon: string | null;
  image_url: string | null;
  url: string | null;
  published_at: string | null;
  category: string | null;
};

const MORE_CATEGORIES = [
  { labelEn: "Markets", labelEs: "Mercados", to: "/markets" },
  { labelEn: "Stocks", labelEs: "Acciones", to: "/stocks" },
  { labelEn: "IPOs", labelEs: "OPVs", to: "/ipos" },
  { labelEn: "ETFs", labelEs: "ETFs", to: "/etfs" },
] as const;

function publisherInitial(source: string | null): string {
  return (source ?? "?").charAt(0).toUpperCase();
}

export function MarketNewsV21() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { language } = useLanguage();
  const lang = getEffectiveLanguage(language, pathname) as HomepageV21Lang;
  const copy = homepageV21Copy(lang);

  const { data: news, isLoading, isError } = useQuery({
    queryKey: ["market-news", "homepage-v21"],
    queryFn: async (): Promise<MarketNewsRow[]> => {
      const { data, error } = await supabase
        .from("market_news")
        .select(
          "id, headline, description, source, publisher_favicon, image_url, url, published_at, category",
        )
        .order("published_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as MarketNewsRow[];
    },
    staleTime: 120_000,
  });

  const featured = news?.[0];
  const secondary = news?.slice(1, 7) ?? [];

  return (
    <section aria-labelledby="hp-news-heading" className="hp-card hp-news overflow-hidden">
      <div className="card-head flex items-center gap-2 px-4 pt-4">
        <h2 id="hp-news-heading" className="text-base font-extrabold">
          {copy.newsTitle}
        </h2>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => navigate("/news")}
          className="text-xs font-bold text-[var(--hp-blue)]"
        >
          {copy.newsMoreLink}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : isError ? (
        <p className="p-4 text-sm text-[var(--hp-ink-2)]">{copy.newsUnavailable}</p>
      ) : !featured ? (
        <p className="p-4 text-sm text-[var(--hp-ink-2)]">{copy.newsEmpty}</p>
      ) : (
        <>
          <article className="news-hero grid border-b border-[var(--hp-line)] md:grid-cols-2">
            <div className="news-hero-txt p-4 md:p-[18px]">
              <div className="news-tags mb-2 flex flex-wrap gap-1.5">
                <span className="chip rounded-md bg-[#e8f1fd] px-2 py-0.5 text-[11px] font-bold text-[var(--hp-blue)]">
                  {copy.newsFeatured}
                </span>
                {featured.category ? (
                  <span className="chip plain rounded-md border border-[var(--hp-line)] bg-muted/30 px-2 py-0.5 text-[11px] font-bold capitalize text-[var(--hp-ink-2)]">
                    {featured.category}
                  </span>
                ) : null}
              </div>
              <h3 className="text-lg font-extrabold leading-snug tracking-tight md:text-xl">
                <a
                  href={featured.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--hp-ink)] hover:text-[var(--hp-blue)] hover:no-underline"
                >
                  {featured.headline}
                </a>
              </h3>
              {featured.description ? (
                <p className="mt-2 text-sm leading-relaxed text-[var(--hp-ink-2)]">{featured.description}</p>
              ) : null}
              <p className="news-meta mt-3 text-xs font-semibold text-[var(--hp-ink-3)]">
                {featured.source ?? "—"}
                {featured.published_at
                  ? ` · ${formatDistanceToNow(new Date(featured.published_at), { addSuffix: true })}`
                  : null}
              </p>
            </div>
            <div className="news-hero-img min-h-[180px] bg-muted/40 md:min-h-[210px]">
              {featured.image_url ? (
                <img
                  src={featured.image_url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full min-h-[180px] items-center justify-center text-2xl font-extrabold text-[var(--hp-ink-3)]">
                  {publisherInitial(featured.source)}
                </div>
              )}
            </div>
          </article>

          <div className="news-grid grid gap-x-8 px-4 py-2 md:grid-cols-2 md:px-[18px]">
            {secondary.map((item) => (
              <article key={item.id} className="news-item border-b border-[var(--hp-line)] py-3 last:border-0">
                <div className="news-src flex items-center gap-2 text-xs font-semibold text-[var(--hp-ink-3)]">
                  <span className="src-dot flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[var(--hp-blue)] text-[9px] font-extrabold text-white">
                    {publisherInitial(item.source)}
                  </span>
                  {item.source}
                  {item.published_at
                    ? ` · ${formatDistanceToNow(new Date(item.published_at), { addSuffix: true })}`
                    : null}
                </div>
                <h4 className="mt-1 text-[15px] font-bold leading-snug">
                  <a
                    href={item.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--hp-ink)] hover:text-[var(--hp-blue)] hover:no-underline"
                  >
                    {item.headline}
                  </a>
                </h4>
              </article>
            ))}
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--hp-line)] px-4 py-3">
        <span className="text-xs text-[var(--hp-ink-3)]">{copy.newsMore}</span>
        {MORE_CATEGORIES.map((cat) => (
          <Link
            key={cat.to}
            to={cat.to}
            className="text-xs font-bold text-[var(--hp-blue)] hover:underline"
          >
            {lang === "es" ? cat.labelEs : cat.labelEn}
          </Link>
        ))}
      </div>
    </section>
  );
}