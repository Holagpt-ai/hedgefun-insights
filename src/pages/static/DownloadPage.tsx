import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DownloadPage() {
  useEffect(() => {
    document.title = "Download HedgeFun App | HedgeFun";
  }, []);

  return (
    <div className="max-w-[800px] mx-auto px-6 py-12">
      <h1 className="text-[1.75rem] font-bold text-foreground border-b-2 border-border pb-3 mb-8">
        Get HedgeFun on Any Device
      </h1>
      <p className="text-muted-foreground mb-8">
        Access real-time market data, watchlists, and analysis wherever you go.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {/* iOS */}
        <div className="border border-border rounded-lg p-6 text-center">
          <Smartphone className="h-12 w-12 mx-auto mb-3 text-accent-blue" />
          <h2 className="text-lg font-bold mb-2">iOS App</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Available on iPhone and iPad. Get real-time quotes, manage your watchlist, and track markets on the go.
          </p>
          <p className="text-xs text-muted-foreground">Coming Soon to the App Store</p>
        </div>

        {/* Android */}
        <div className="border border-border rounded-lg p-6 text-center">
          <Smartphone className="h-12 w-12 mx-auto mb-3 text-accent-blue" />
          <h2 className="text-lg font-bold mb-2">Android App</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Available on Android phones and tablets. Full market data and portfolio tracking at your fingertips.
          </p>
          <p className="text-xs text-muted-foreground">Coming Soon to Google Play</p>
        </div>
      </div>

      {/* Web App */}
      <div className="border border-border rounded-lg p-6 text-center">
        <h2 className="text-lg font-bold mb-2">Use HedgeFun in Your Browser</h2>
        <p className="text-sm text-muted-foreground mb-4">
          No download required. Access all features instantly at hedgefun.fun on any device.
        </p>
        <Button asChild className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground">
          <Link to="/">Open Web App</Link>
        </Button>
      </div>
    </div>
  );
}
