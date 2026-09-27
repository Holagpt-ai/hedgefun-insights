import { hasProAccess } from "@/lib/entitlement";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bell, Plus, Info } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import PriceAlertsTable from "@/components/alerts/PriceAlertsTable";
import CreateAlertDrawer from "@/components/alerts/CreateAlertDrawer";
import EmptyAlertsState from "@/components/alerts/EmptyAlertsState";
import { PRICE_ALERTS_COPY, type PriceAlert } from "@/config/price-alerts.config";
import { PRICING } from "@/config/pricing";
import { usePriceAlerts } from "@/hooks/usePriceAlerts";
import type { PriceAlertView } from "@/lib/price-alerts/db";

function viewToLegacy(v: PriceAlertView): PriceAlert {
  return {
    id: v.id,
    symbol: v.symbol,
    condition: v.condition,
    value: v.value,
    note: v.note,
    enabled: v.enabled,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    lastTriggeredAt: v.lastTriggeredAt,
    lastQuotePrice: v.lastQuotePrice,
    dataLatency: v.dataLatency,
  };
}

export default function PriceAlertsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    alerts,
    loading,
    error,
    createAlert,
    updateAlert,
    setEnabled,
    deleteAlert,
    evaluateNow,
  } = usePriceAlerts();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<PriceAlert | null>(null);
  const [prefillSymbol, setPrefillSymbol] = useState<string | undefined>();

  const isPro = hasProAccess(profile?.plan);

  useEffect(() => {
    const sym = searchParams.get("symbol");
    if (!sym || !isPro) return;
    setPrefillSymbol(sym.toUpperCase());
    setEditing(null);
    setDrawerOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("symbol");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, isPro]);

  useEffect(() => {
    if (!isPro) return;
    const tick = window.setInterval(() => {
      void evaluateNow().catch(() => {});
    }, 90_000);
    void evaluateNow().catch(() => {});
    return () => window.clearInterval(tick);
  }, [isPro, evaluateNow]);

  if (!isPro) {
    return (
      <div className="relative h-[calc(100vh-8rem)] w-full">
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6 bg-background/80 backdrop-blur-sm">
          <div className="text-4xl mb-3">🔔</div>
          <h2 className="text-2xl font-semibold text-foreground mb-2">Price Alerts — PRO Feature</h2>
          <p className="text-sm text-muted-foreground max-w-md mb-6">
            Set deterministic price and percent-move alerts on symbols you track. In-app delivery on delayed market data.
          </p>
          <button
            onClick={() => navigate("/pro")}
            className="bg-accent-blue text-primary-foreground text-sm font-semibold px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity duration-200"
          >
            {`Unlock PRO — $${PRICING.pro.monthly}/month`}
          </button>
        </div>
      </div>
    );
  }

  const upsert = async (
    data: Omit<PriceAlert, "id" | "createdAt" | "updatedAt">,
    id?: string,
  ) => {
    try {
      if (id) {
        await updateAlert(id, data);
        toast({ title: "Alert updated", description: data.symbol });
      } else {
        await createAlert(data);
        toast({ title: "Alert created", description: data.symbol });
      }
    } catch (e) {
      toast({
        title: "Could not save alert",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
      throw e;
    }
    setEditing(null);
  };

  const toggle = async (id: string, enabled: boolean) => {
    try {
      await setEnabled(id, enabled);
    } catch (e) {
      toast({
        title: "Could not update alert",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteAlert(id);
      toast({ title: "Alert deleted" });
    } catch (e) {
      toast({
        title: "Could not delete alert",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  const openCreate = () => {
    setEditing(null);
    setPrefillSymbol(undefined);
    setDrawerOpen(true);
  };

  const openEdit = (alert: PriceAlert) => {
    setEditing(alert);
    setPrefillSymbol(undefined);
    setDrawerOpen(true);
  };

  const legacyAlerts = alerts.map(viewToLegacy);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-accent-blue" />
            <h1 className="text-xl md:text-2xl font-semibold text-foreground">Price Alerts</h1>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {PRICE_ALERTS_COPY.dataBadge}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            User-owned threshold alerts with in-app notifications when conditions cross on verified quotes.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground shrink-0"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Create Alert
        </Button>
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-accent-blue/30 bg-accent-blue-light/50 px-3.5 py-3">
        <Info className="h-4 w-4 text-accent-blue shrink-0 mt-0.5" />
        <div className="text-xs text-foreground leading-relaxed">{PRICE_ALERTS_COPY.banner}</div>
      </div>

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading alerts…</p>
      ) : legacyAlerts.length === 0 ? (
        <EmptyAlertsState onCreate={openCreate} />
      ) : (
        <PriceAlertsTable alerts={legacyAlerts} onToggle={toggle} onEdit={openEdit} onDelete={remove} />
      )}

      <p className="text-[11px] text-muted-foreground text-center pt-2">{PRICE_ALERTS_COPY.footerDisclaimer}</p>

      <CreateAlertDrawer
        open={drawerOpen}
        onOpenChange={(o) => {
          setDrawerOpen(o);
          if (!o) {
            setEditing(null);
            setPrefillSymbol(undefined);
          }
        }}
        editing={editing}
        prefillSymbol={prefillSymbol}
        onSave={upsert}
      />
    </div>
  );
}
