import { Star, SlidersHorizontal, Activity, Calendar, TrendingUp, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

const tools = [
  { icon: Star, labelKey: "watchlist", esLabel: "Seguimiento", route: "/watchlist" },
  { icon: SlidersHorizontal, labelKey: "stockScreener", esLabel: "Buscador de acciones", route: "/screener" },
  { icon: Activity, labelKey: "marketMovers", esLabel: "Movimientos del mercado", route: "/movers" },
  { icon: Calendar, labelKey: "earningsCalendar", esLabel: "Calendario de ganancias", route: "/earnings" },
  { icon: TrendingUp, labelKey: "trending", esLabel: "Acciones en tendencia", route: "/trending" },
  { icon: UserPlus, labelKey: "hedgefunPro", esLabel: "HedgeFun Pro", route: "/pro" },
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
            className="fintech-card p-4 flex flex-col items-start gap-2 hover:border-accent-blue transition-colors text-left"
          >
            <tool.icon className="h-7 w-7 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">{t(tool.labelKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
