import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ExternalLink, Plus, Copy } from "lucide-react";

interface Props {
  ticker: string;
}

export default function StockCtaButtons({ ticker }: Props) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <Button
        className="flex-1"
        onClick={() => navigate(`/chart/${ticker}`)}
      >
        <ExternalLink className="w-4 h-4 mr-1.5" />
        Full Chart
      </Button>
      <Button
        variant="outline"
        className="flex-1 border-accent-blue text-accent-blue hover:bg-accent-blue/10"
        onClick={() => navigate(`/watchlist`)}
      >
        <Plus className="w-4 h-4 mr-1.5" />
        Watchlist
      </Button>
      <Button
        variant="outline"
        className="flex-1 border-accent-blue text-accent-blue hover:bg-accent-blue/10"
        onClick={() => navigate(`/stocks/compare?tickers=${ticker}`)}
      >
        <Copy className="w-4 h-4 mr-1.5" />
        Compare
      </Button>
    </div>
  );
}
