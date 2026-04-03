import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { createPortalSession } from "@/lib/stripe";
import { PRICING } from "@/config/pricing";
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

  const isPro = profile?.plan === "pro";

  const formattedEndDate = (profile as any)?.current_period_end
    ? new Date((profile as any).current_period_end).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const handleUpgrade = () => {
    toast({
      title: "Upgrade Coming Soon",
      description: "We are finalizing our payment processor. Please check back shortly or contact us at info@hedgefun.fun to get early Pro access.",
      duration: 6000,
    });
  };

  const handlePortal = async () => {
    try {
      const { url } = await createPortalSession();
      if (url) window.location.href = url;
    } catch {
      toast({ title: "Unable to open billing portal", variant: "destructive" });
    }
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
                {formattedEndDate && (
                  <span className="text-xs text-muted-foreground">Next billing: {formattedEndDate}</span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive text-destructive hover:bg-destructive/10"
                  onClick={handlePortal}
                >
                  Cancel Subscription
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
        <div className="flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <span className={`${isPro ? "text-secondary-foreground" : "text-muted-foreground"}`} style={{ fontSize: "0.875rem" }}>
            {isPro ? "Card on file — managed securely by Stripe" : "No payment method on file"}
          </span>
        </div>
      </div>

      {/* CARD 3 — Billing History */}
      <div className="fintech-card p-6 mb-4">
        <h2 className="font-bold text-foreground mb-4" style={{ fontSize: "1rem", fontWeight: 700 }}>
          Billing History
        </h2>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "2px solid hsl(var(--border))" }}>
              {["Date", "Description", "Amount", "Status"].map((h) => (
                <th
                  key={h}
                  className="text-left text-secondary-foreground pb-2"
                  style={{ fontSize: "0.8125rem", fontWeight: 600 }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={4} className="text-center" style={{ padding: "32px 0" }}>
                <div className="flex flex-col items-center gap-2">
                  <Receipt className="text-muted-foreground" style={{ width: 48, height: 48 }} />
                  <span className="text-muted-foreground" style={{ fontSize: "0.875rem" }}>
                    No billing history yet
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* CARD 4 — Billing Portal */}
      <div className="fintech-card p-6">
        <h2 className="font-bold text-foreground mb-2" style={{ fontSize: "1rem", fontWeight: 700 }}>
          Invoices & Receipts
        </h2>
        <p className="text-secondary-foreground mb-4" style={{ fontSize: "0.875rem" }}>
          Billing history, invoices, and receipts are managed securely through Stripe.
        </p>
        <Button variant="outline" onClick={handlePortal}>
          Open Billing Portal
        </Button>
      </div>
    </div>
  );
};

export default BillingPage;
