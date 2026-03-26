import { Link } from "react-router-dom";
import { BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function StockFinancialsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center max-w-md mx-auto">
      <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-4">
        <BarChart2 className="w-7 h-7 text-blue-600" />
      </div>
      <h3 className="text-[1.125rem] font-bold text-foreground mb-2">
        Financial Statements
      </h3>
      <p className="text-[0.875rem] text-muted-foreground mb-1">
        Upgrade to HedgeFun Pro to access full financial statements including:
      </p>
      <ul className="text-[0.875rem] text-muted-foreground text-left mb-6 space-y-1">
        <li>✓ Income Statement (Annual, Quarterly, TTM)</li>
        <li>✓ Balance Sheet</li>
        <li>✓ Cash Flow Statement</li>
        <li>✓ Financial Ratios & KPIs</li>
        <li>✓ Up to 10 years of history</li>
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
