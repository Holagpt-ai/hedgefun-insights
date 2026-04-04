import { Star, SlidersHorizontal, Activity, Calendar, TrendingUp, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

const tools = [
  {
    icon: Star,
    labelKey: "watchlist",
    esLabel: "Seguimiento",
    route: "/watchlist",
    iconColor: "#0ea5e9",
    bgColor: "rgba(14,165,233,0.12)",
    glowColor: "rgba(14,165,233,0.25)",
  },
  {
    icon: SlidersHorizontal,
    labelKey: "stockScreener",
    esLabel: "Buscador de acciones",
    route: "/screener",
    iconColor: "#a855f7",
    bgColor: "rgba(168,85,247,0.12)",
    glowColor: "rgba(168,85,247,0.25)",
  },
  {
    icon: Activity,
    labelKey: "marketMovers",
    esLabel: "Movimientos del mercado",
    route: "/markets/gainers",
    iconColor: "#22c55e",
    bgColor: "rgba(34,197,94,0.12)",
    glowColor: "rgba(34,197,94,0.25)",
  },
  {
    icon: Calendar,
    labelKey: "earningsCalendar",
    esLabel: "Calendario de ganancias",
    route: "/earnings",
    iconColor: "#f59e0b",
    bgColor: "rgba(245,158,11,0.12)",
    glowColor: "rgba(245,158,11,0.25)",
  },
  {
    icon: TrendingUp,
    labelKey: "trending",
    esLabel: "Tendencias",
    route: "/trending",
    iconColor: "#f97316",
    bgColor: "rgba(249,115,22,0.12)",
    glowColor: "rgba(249,115,22,0.25)",
  },
  {
    icon: UserPlus,
    labelKey: "hedgefunPro",
    esLabel: "HedgeFun Pro",
    route: "/pro",
    iconColor: "#6366f1",
    bgColor: "rgba(99,102,241,0.12)",
    glowColor: "rgba(99,102,241,0.25)",
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
            className="fintech-card p-4 flex flex-col items-start gap-2 transition-colors text-left"
            style={{ transition: "border-color 0.2s ease" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = `${tool.iconColor}44`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "";
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: tool.bgColor,
                border: `1px solid ${tool.iconColor}22`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 8,
                flexShrink: 0,
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 20px ${tool.glowColor}`;
                (e.currentTarget as HTMLElement).style.transform = "scale(1.06)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
                (e.currentTarget as HTMLElement).style.transform = "scale(1)";
              }}
            >
              <tool.icon
                size={24}
                strokeWidth={1.8}
                style={{ color: tool.iconColor }}
              />
            </div>
            <span className="text-sm font-semibold text-foreground">{t(tool.labelKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
