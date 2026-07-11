import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Lock, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import StatsStrip from "@/components/journal/StatsStrip";
import EquityCurve from "@/components/journal/EquityCurve";
import TradeTable, { type Trade } from "@/components/journal/TradeTable";
import TradeDrawer from "@/components/journal/TradeDrawer";
import JournalAIPanel from "@/components/journal/JournalAIPanel";
import { hasProAccess } from "@/lib/entitlement";

function normalizeSymbol(raw: string | null): string {
  if (!raw) return "";
  return raw.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
}

export default function JournalPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [prefillSymbol, setPrefillSymbol] = useState<string>("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const isPro = hasProAccess(profile?.plan);

  useEffect(() => {
    const sym = normalizeSymbol(searchParams.get("symbol"));
    if (sym) {
      setEditingTrade(null);
      setPrefillSymbol(sym);
      setDrawerOpen(true);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  if (!isPro) {
    return (
      <div className="relative h-[calc(100vh-8rem)] w-full">
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6 bg-background/80 backdrop-blur-sm">
          <div className="text-4xl mb-3">📒</div>
          <h2 className="text-2xl font-semibold text-foreground mb-2">
            Stock Journal — PRO Feature
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mb-6">
            Unlock the Stock Journal and full dashboard workflow.
          </p>
          <button
            onClick={() => navigate("/pro")}
            className="bg-accent-blue text-primary-foreground text-sm font-semibold px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity duration-200"
          >
            Request Pro Access
          </button>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className={`p-4 md:p-6 max-w-6xl mx-auto space-y-6 transition-all duration-300 ${aiPanelOpen ? "lg:pr-80" : ""}`}>
        {/* Workflow nav chips */}
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => navigate("/dashboard/screeners")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Screeners
          </button>
          <span className="text-border">·</span>
          <button
            type="button"
            onClick={() => navigate("/dashboard/action-center")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Action Center
          </button>
        </div>


        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Stock Journal</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track every trade. Learn from every move.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <button
                    disabled
                    className="text-sm font-medium px-4 py-2 rounded-lg border border-border bg-surface-card text-muted-foreground opacity-60 cursor-not-allowed"
                  >
                    Import
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Coming Soon</TooltipContent>
            </Tooltip>
            <button
              onClick={() => setAiPanelOpen(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border border-border bg-surface-card text-foreground hover:bg-muted transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Ask AI
            </button>
            <button
              onClick={() => {
                setEditingTrade(null);
                setDrawerOpen(true);
              }}
              className="bg-accent-blue text-primary-foreground text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
            >
              + Log Trade
            </button>
          </div>
        </div>

        {/* Stats */}
        <StatsStrip refreshKey={refreshKey} />

        {/* Equity curve */}
        <EquityCurve refreshKey={refreshKey} />

        {/* Tabs */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList>
            <TabsTrigger value="all">All Trades</TabsTrigger>
            <TabsTrigger value="open">Open</TabsTrigger>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <TabsTrigger
                    value="calendar"
                    disabled
                    className="opacity-60 cursor-not-allowed flex items-center gap-1.5"
                  >
                    Calendar
                    <Lock className="w-3 h-3" />
                  </TabsTrigger>
                </span>
              </TooltipTrigger>
              <TooltipContent>Coming Soon</TooltipContent>
            </Tooltip>
          </TabsList>
          <TabsContent value="all">
            {user && (
              <TradeTable
                userId={user.id}
                onEdit={(t) => {
                  setEditingTrade(t);
                  setDrawerOpen(true);
                }}
                onAskAI={() => setAiPanelOpen(true)}
                refreshKey={refreshKey}
              />
            )}
          </TabsContent>
          <TabsContent value="open">
            {user && (
              <TradeTable
                userId={user.id}
                filterStatus="open"
                onEdit={(t) => {
                  setEditingTrade(t);
                  setDrawerOpen(true);
                }}
                onAskAI={() => setAiPanelOpen(true)}
                refreshKey={refreshKey}
              />
            )}
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground text-center pt-4">
          The Stock Journal is an educational trade-tracking tool. P&amp;L figures are self-reported and for personal review only. Not financial, tax, or legal advice.
        </p>

        <TradeDrawer
          open={drawerOpen}
          onClose={() => {
            setDrawerOpen(false);
            setPrefillSymbol("");
          }}
          trade={editingTrade}
          prefillSymbol={prefillSymbol}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />

      </div>
      <JournalAIPanel
        open={aiPanelOpen}
        onClose={() => setAiPanelOpen(false)}
        userId={user?.id ?? ""}
      />
    </TooltipProvider>
  );
}
