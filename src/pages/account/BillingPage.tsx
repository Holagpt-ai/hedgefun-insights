import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

import { PRICING } from "@/config/pricing";
import { hasProAccess } from "@/lib/entitlement";
import { toast } from "@/hooks/use-toast";
import { CreditCard, Receipt } from "lucide-react";

const FREE_FEATURES = [
  "Basic market data",
  "Watchlist up to 10 stocks",
  "Limited screener filters",
];

const PRO_FEATURES = [
  "Real-time market data",
  "Unlimited watchlist",
  "All screener filters",
  "Analyst ratings & top stocks",
  "Up to 30 years financial history",
];

const BillingPage = () => {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) navigate("/");
  }, [loading, user, navigate]);

  useEffect(() => {
    document.title = "Manage Billing | HedgeFun";
  }, []);

  if (loading || !user) return null;

  const isPro = hasProAccess(profile?.plan);

  const formattedEndDate = profile?.current_period_end
    ? new Date(profile.current_period_end).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const handleUpgrade = () => {
    toast({
      title: "Coming Soon",
      description: "Payment processing is being set up. Contact info@hedgefun.fun for early Pro access.",
    });
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      {/* Page Heading */}
      <h1
        className="font-bold text-foreground mb-6"
        style={{ fontSize: "1.75rem", fontWeight: 700, borderBottom: "1px solid hsl(var(--border))", paddingBottom: 12 }}
      >
        Manage Billing
      </h1>

      {/* CARD 1 — Current Plan */}
      <div className="fintech-card p-6 mb-4">
        <h2 className="font-bold text-foreground mb-4" style={{ fontSize: "1rem", fontWeight: 700 }}>
          Current Plan
        </h2>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Left */}
          <div>
            <span
              className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                isPro
                  ? "bg-accent-blue text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isPro ? "Pro Plan" : "Free Plan"}
            </span>
            <p
              className={`mt-2 font-semibold ${isPro ? "text-green" : "text-muted-foreground"}`}
              style={{ fontSize: "1rem" }}
            >
              {isPro ? `$${PRICING.pro.monthly} / month` : `$${PRICING.free.monthly} / month`}
            </p>
            <ul className="mt-3 space-y-1">
              {(isPro ? PRO_FEATURES : FREE_FEATURES).map((f) => (
                <li key={f} className="text-secondary-foreground" style={{ fontSize: "0.875rem" }}>
                  • {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Right */}
          <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
            {isPro ? (
              <>
                {formattedEndDate ? (
                  <span className="text-xs text-muted-foreground">Next billing: {formattedEndDate}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">No active billing period</span>
                )}
                <Button variant="outline" size="sm" disabled>
                  Self-service billing coming soon
                </Button>
              </>
            ) : (
              <Button size="sm" className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground" onClick={handleUpgrade}>
                Upgrade to Pro
              </Button>
            )}
          </div>
        </div>
      </div>


      {/* CARD 2 — Payment Method */}
      <div className="fintech-card p-6 mb-4">
        <h2 className="font-bold text-foreground mb-4" style={{ fontSize: "1rem", fontWeight: 700 }}>
          Payment Method
        </h2>
        <div className="flex items-start gap-3">
          <CreditCard className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-secondary-foreground" style={{ fontSize: "0.875rem" }}>
              Payment method management is not connected yet.
            </p>
            <p className="text-muted-foreground" style={{ fontSize: "0.8125rem" }}>
              If you have manual Pro access, contact{" "}
              <a href="mailto:info@hedgefun.fun" className="underline">info@hedgefun.fun</a> for changes.
            </p>
          </div>
        </div>
      </div>

      {/* CARD 3 — Billing History */}
      <div className="fintech-card p-6 mb-4">
        <h2 className="font-bold text-foreground mb-4" style={{ fontSize: "1rem", fontWeight: 700 }}>
          Billing History
        </h2>
        <div className="flex flex-col items-center text-center" style={{ padding: "24px 0" }}>
          <Receipt className="text-muted-foreground mb-2" style={{ width: 48, height: 48 }} />
          <span className="text-secondary-foreground" style={{ fontSize: "0.875rem" }}>
            No billing history yet.
          </span>
          <span className="text-muted-foreground mt-1" style={{ fontSize: "0.8125rem" }}>
            Receipts and invoices will appear here once self-service billing is connected.
          </span>
        </div>
      </div>

      {/* CARD 4 — Billing Portal */}
      <div className="fintech-card p-6">
        <h2 className="font-bold text-foreground mb-2" style={{ fontSize: "1rem", fontWeight: 700 }}>
          Invoices & Receipts
        </h2>
        <p className="text-secondary-foreground mb-4" style={{ fontSize: "0.875rem" }}>
          Self-service billing portal coming soon. For billing help in the meantime, contact{" "}
          <a href="mailto:info@hedgefun.fun" className="underline">info@hedgefun.fun</a>.
        </p>
        <Button variant="outline" disabled>
          Billing Portal Coming Soon
        </Button>
      </div>

    </div>
  );
};

export default BillingPage;
