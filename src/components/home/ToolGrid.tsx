import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

const tools = [
  {
    labelKey: "watchlist",
    esLabel: "Seguimiento",
    route: "/watchlist",
    svg: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-watchlist" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#06b6d4"/>
            <stop offset="100%" stopColor="#3b82f6"/>
          </linearGradient>
        </defs>
        <polygon points="24,6 29,18 42,18 32,26 36,39 24,31 12,39 16,26 6,18 19,18" stroke="url(#grad-watchlist)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" fill="none"/>
      </svg>
    ),
  },
  {
    labelKey: "stockScreener",
    esLabel: "Buscador de acciones",
    route: "/screener",
    svg: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-screener" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#a855f7"/>
            <stop offset="100%" stopColor="#ec4899"/>
          </linearGradient>
        </defs>
        <line x1="8" y1="14" x2="40" y2="14" stroke="url(#grad-screener)" strokeWidth="2.2" strokeLinecap="round"/>
        <line x1="8" y1="24" x2="40" y2="24" stroke="url(#grad-screener)" strokeWidth="2.2" strokeLinecap="round"/>
        <line x1="8" y1="34" x2="40" y2="34" stroke="url(#grad-screener)" strokeWidth="2.2" strokeLinecap="round"/>
        <circle cx="18" cy="14" r="4" stroke="url(#grad-screener)" strokeWidth="2.2" fill="none"/>
        <circle cx="30" cy="24" r="4" stroke="url(#grad-screener)" strokeWidth="2.2" fill="none"/>
        <circle cx="18" cy="34" r="4" stroke="url(#grad-screener)" strokeWidth="2.2" fill="none"/>
      </svg>
    ),
  },
  {
    labelKey: "marketMovers",
    esLabel: "Movimientos del mercado",
    route: "/markets/gainers",
    svg: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-movers" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#22c55e"/>
            <stop offset="100%" stopColor="#06b6d4"/>
          </linearGradient>
        </defs>
        <polyline points="4,24 10,24 16,10 22,36 28,18 34,28 38,24 44,24" stroke="url(#grad-movers)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    ),
  },
  {
    labelKey: "earningsCalendar",
    esLabel: "Calendario de ganancias",
    route: "/earnings",
    svg: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-calendar" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#f59e0b"/>
            <stop offset="100%" stopColor="#f97316"/>
          </linearGradient>
        </defs>
        <rect x="6" y="10" width="36" height="32" rx="4" ry="4" stroke="url(#grad-calendar)" strokeWidth="2.2" fill="none"/>
        <line x1="6" y1="20" x2="42" y2="20" stroke="url(#grad-calendar)" strokeWidth="2.2" strokeLinecap="round"/>
        <line x1="16" y1="6" x2="16" y2="16" stroke="url(#grad-calendar)" strokeWidth="2.2" strokeLinecap="round"/>
        <line x1="32" y1="6" x2="32" y2="16" stroke="url(#grad-calendar)" strokeWidth="2.2" strokeLinecap="round"/>
        <circle cx="16" cy="30" r="2" fill="url(#grad-calendar)"/>
        <circle cx="24" cy="30" r="2" fill="url(#grad-calendar)"/>
        <circle cx="32" cy="30" r="2" fill="url(#grad-calendar)"/>
      </svg>
    ),
  },
  {
    labelKey: "trending",
    esLabel: "Tendencias",
    route: "/trending",
    svg: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-trending" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#f97316"/>
            <stop offset="100%" stopColor="#ef4444"/>
          </linearGradient>
        </defs>
        <polyline points="4,34 14,22 22,28 34,12 44,12" stroke="url(#grad-trending)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <polyline points="36,12 44,12 44,20" stroke="url(#grad-trending)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    ),
  },
  {
    labelKey: "hedgefunPro",
    esLabel: "HedgeFun Pro",
    route: "/pro",
    svg: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-pro" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#6366f1"/>
            <stop offset="100%" stopColor="#a855f7"/>
          </linearGradient>
        </defs>
        <polyline points="6,34 6,18 18,28 24,10 30,28 42,18 42,34" stroke="url(#grad-pro)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <line x1="6" y1="38" x2="42" y2="38" stroke="url(#grad-pro)" strokeWidth="2.2" strokeLinecap="round"/>
      </svg>
    ),
  },
];

export function ToolGrid() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="px-4 py-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {tools.map((tool) => (
          <button
            key={tool.route}
            onClick={() => navigate(tool.route)}
            className="fintech-card p-4 flex flex-col items-start gap-2 text-left"
            style={{ transition: "transform 0.2s ease, box-shadow 0.2s ease" }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.transform = "translateY(-2px)";
              el.style.boxShadow = "0 8px 24px rgba(0,0,0,0.08)";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.transform = "translateY(0)";
              el.style.boxShadow = "none";
            }}
          >
            {tool.svg}
            <span className="text-sm font-semibold text-foreground">{t(tool.labelKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
