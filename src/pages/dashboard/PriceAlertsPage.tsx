import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Plus, Info } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import PriceAlertsTable from "@/components/alerts/PriceAlertsTable";
import CreateAlertDrawer from "@/components/alerts/CreateAlertDrawer";
import EmptyAlertsState from "@/components/alerts/EmptyAlertsState";
import {
  PRICE_ALERTS_STORAGE_KEY, PRICE_ALERTS_COPY,
  type PriceAlert,
} from "@/config/price-alerts.config";

function loadAlerts(): PriceAlert[] {
  try {
    const raw = localStorage.getItem(PRICE_ALERTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAlerts(alerts: PriceAlert[]) {
  try {
    localStorage.setItem(PRICE_ALERTS_STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    // ignore quota errors — preview only
  }
}

export default function PriceAlertsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<PriceAlert | null>(null);

  const isPro =
    profile?.plan === "pro" ||
    profile?.plan === "admin" ||
    profile?.plan === "unlimited";

  useEffect(() => {
    setAlerts(loadAlerts());
  }, []);

  if (!isPro) {
    return (
      <div className="relative h-[calc(100vh-8rem)] w-full">
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6 bg-background/80 backdrop-blur-sm">
          <div className="text-4xl mb-3">🔔</div>
          <h2 className="text-2xl font-semibold text-foreground mb-2">
            Price Alerts — PRO Feature
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mb-6">
            Plan and preview price alerts for tickers you want to monitor. Delivery is not connected yet.
          </p>
          <button
            onClick={() => navigate("/pro")}
            className="bg-accent-blue text-primary-foreground text-sm font-semibold px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity duration-200"
          >
            Unlock PRO — $5/month
          </button>
        </div>
      </div>
    );
  }

  const upsert = (
    data: Omit<PriceAlert, "id" | "createdAt" | "updatedAt">,
    id?: string,
  ) => {
    const now = new Date().toISOString();
    setAlerts((prev) => {
      let next: PriceAlert[];
      if (id) {
        next = prev.map((a) => (a.id === id ? { ...a, ...data, updatedAt: now } : a));
        toast({ title: "Alert updated", description: `${data.symbol} · preview only` });
      } else {
        const created: PriceAlert = {
          ...data,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        };
        next = [created, ...prev];
        toast({ title: "Alert created", description: `${data.symbol} · preview only` });
      }
      saveAlerts(next);
      return next;
    });
    setEditing(null);
  };

  const toggle = (id: string, enabled: boolean) => {
    setAlerts((prev) => {
      const next = prev.map((a) =>
        a.id === id ? { ...a, enabled, updatedAt: new Date().toISOString() } : a,
      );
      saveAlerts(next);
      return next;
    });
  };

  const remove = (id: string) => {
    setAlerts((prev) => {
      const next = prev.filter((a) => a.id !== id);
      saveAlerts(next);
      return next;
    });
    toast({ title: "Alert deleted" });
  };

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };

  const openEdit = (alert: PriceAlert) => {
    setEditing(alert);
    setDrawerOpen(true);
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-accent-blue" />
            <h1 className="text-xl md:text-2xl font-semibold text-foreground">Price Alerts</h1>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {PRICE_ALERTS_COPY.previewBadge}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Create preview alerts for tickers you want to monitor. Delivery is not connected yet.
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

      {/* Preview banner */}
      <div className="flex items-start gap-2.5 rounded-lg border border-accent-blue/30 bg-accent-blue-light/50 px-3.5 py-3">
        <Info className="h-4 w-4 text-accent-blue shrink-0 mt-0.5" />
        <div className="text-xs text-foreground leading-relaxed">
          <span className="font-semibold">Preview mode.</span>{" "}
          {PRICE_ALERTS_COPY.previewBanner}
        </div>
      </div>

      {/* List / empty state */}
      {alerts.length === 0 ? (
        <EmptyAlertsState onCreate={openCreate} />
      ) : (
        <PriceAlertsTable
          alerts={alerts}
          onToggle={toggle}
          onEdit={openEdit}
          onDelete={remove}
        />
      )}

      {/* Footer disclaimer */}
      <p className="text-[11px] text-muted-foreground text-center pt-2">
        {PRICE_ALERTS_COPY.footerDisclaimer}
      </p>

      <CreateAlertDrawer
        open={drawerOpen}
        onOpenChange={(o) => {
          setDrawerOpen(o);
          if (!o) setEditing(null);
        }}
        editing={editing}
        onSave={upsert}
      />
    </div>
  );
}
