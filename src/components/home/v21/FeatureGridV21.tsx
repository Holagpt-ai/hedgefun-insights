import { useNavigate } from "react-router-dom";
import {
  Star,
  SlidersHorizontal,
  Activity,
  Calendar,
  TrendingUp,
  Crown,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { publicWatchlistEntryHref } from "@/lib/public/public-workflow-links";
import { trackAuthHandoff } from "@/lib/analytics/public-events";
import { useLocation } from "react-router-dom";
import { getEffectiveLanguage } from "@/config/locale-v1.policy";
import {
  HOMEPAGE_V21_TOOL_COPY,
  homepageV21Copy,
  type HomepageV21Lang,
} from "@/lib/homepage/homepage-v21-copy";

const TOOL_ICONS = {
  watchlist: { Icon: Star, className: "bg-[#e8f1fd] text-[var(--hp-blue)]" },
  screener: { Icon: SlidersHorizontal, className: "bg-[#f1eafd] text-[#7b3fd4]" },
  movers: { Icon: Activity, className: "bg-[#e6f6ee] text-[var(--hp-up)]" },
  calendars: { Icon: Calendar, className: "bg-[#fdf3e0] text-[#b7791f]" },
  trending: { Icon: TrendingUp, className: "bg-[#fdeef3] text-[#d6336c]" },
  pro: { Icon: Crown, className: "" },
} as const;

export function FeatureGridV21() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const { pathname } = useLocation();
  const lang = getEffectiveLanguage(language, pathname) as HomepageV21Lang;
  const copy = homepageV21Copy(lang);
  const tools = HOMEPAGE_V21_TOOL_COPY[lang];

  const open = (route: string, authSource?: string) => {
    if (authSource && !user) {
      trackAuthHandoff({ mode: "login", returnPath: route, source: authSource });
    }
    navigate(route);
  };

  const cards = [
    {
      id: "watchlist",
      title: t("watchlist"),
      desc: tools.watchlistDesc,
      go: tools.watchlistGo,
      route: publicWatchlistEntryHref(!!user),
      authSource: "homepage_v21_tool_watchlist",
      pro: false,
    },
    {
      id: "screener",
      title: t("stockScreener"),
      desc: tools.screenerDesc,
      go: tools.screenerGo,
      route: "/screener",
      pro: false,
    },
    {
      id: "movers",
      title: t("marketMovers"),
      desc: tools.moversDesc,
      go: tools.moversGo,
      route: "/markets/gainers",
      pro: false,
    },
    {
      id: "calendars",
      title: t("earningsCalendar"),
      desc: tools.calendarsDesc,
      go: tools.calendarsGo,
      route: "/earnings",
      pro: false,
    },
    {
      id: "trending",
      title: t("trending"),
      desc: tools.trendingDesc,
      go: tools.trendingGo,
      route: "/trending",
      pro: false,
    },
    {
      id: "pro",
      title: t("hedgefunPro"),
      desc: tools.proDesc,
      go: tools.proGo,
      route: "/pro",
      pro: true,
    },
  ] as const;

  return (
    <section aria-labelledby="hp-tools-heading" className="hp-tools-band w-full min-w-0">
      <h2 id="hp-tools-heading" className="mb-3 px-1 text-base font-extrabold text-[var(--hp-ink)]">
        {copy.toolsTitle}
      </h2>
      <div className="tools-grid">
        {cards.map((card) => {
          const icon = TOOL_ICONS[card.id as keyof typeof TOOL_ICONS];
          const { Icon } = icon;
          return (
            <button
              key={card.id}
              type="button"
              className={`tool-card ${card.pro ? "pro" : ""}`}
              onClick={() => open(card.route, "authSource" in card ? card.authSource : undefined)}
            >
              <span className={`tool-ic ${icon.className}`}>
                <Icon className="h-6 w-6" aria-hidden />
              </span>
              <h3>
                {card.title}
                {card.pro ? (
                  <span className="pro-tag ml-1 rounded-full bg-amber-500/20 px-1.5 py-0 text-[10px] font-extrabold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    Pro
                  </span>
                ) : null}
              </h3>
              <p>{card.desc}</p>
              <span className="tool-go mt-auto">
                {card.go}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}