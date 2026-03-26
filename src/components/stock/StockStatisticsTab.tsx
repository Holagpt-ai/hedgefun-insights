import { Link } from "react-router-dom";
import { TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function StockStatisticsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center max-w-md mx-auto">
      <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-4">
        <TrendingUp className="w-7 h-7 text-blue-600" />
      </div>
      <h3 className="text-[1.125rem] font-bold text-foreground mb-2">
        Advanced Statistics
      </h3>
      <p className="text-[0.875rem] text-muted-foreground mb-1">
        Upgrade to HedgeFun Pro to access detailed statistics including:
      </p>
      <ul className="text-[0.875rem] text-muted-foreground text-left mb-6 space-y-1">
        <li>✓ Valuation ratios (P/E, P/S, P/B, EV/EBITDA)</li>
        <li>✓ Profitability metrics (ROE, ROA, margins)</li>
        <li>✓ Growth rates (Revenue, EPS, FCF)</li>
        <li>✓ Debt & liquidity ratios</li>
        <li>✓ Efficiency metrics</li>
      </ul>
      <Link to="/pro">
        <Button className="w-full max-w-xs bg-blue-600 hover:bg-blue-700 text-white">
          Upgrade to HedgeFun Pro
        </Button>
      </Link>
      <p className="text-[0.75rem] text-muted-foreground mt-3">
        7-day free trial · Cancel anytime
      </p>
    </div>
  );
}
