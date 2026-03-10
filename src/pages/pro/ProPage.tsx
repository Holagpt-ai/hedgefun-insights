import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/lib/analytics";
import { createCheckoutSession } from "@/lib/stripe";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    features: ["Basic stock data", "5 watchlist items", "10 AI queries/day", "Market news", "Index overview"],
    cta: "Current Plan",
    disabled: true,
    highlight: false,
    badge: null,
    priceId: null,
  },
  {
    name: "Pro Monthly",
    price: "$9.99",
    period: "/month",
    features: ["Real-time data", "Unlimited watchlist", "Stock screener", "Advanced charts", "Unlimited AI queries", "No ads"],
    cta: "Start 7-Day Free Trial",
    disabled: false,
    highlight: true,
    badge: "Most Popular",
    priceId: "pro_monthly",
  },
  {
    name: "Pro Annual",
    price: "$99",
    period: "/year",
    features: ["Everything in Pro Monthly", "Save 17% vs monthly", "Priority support", "Early access to new features"],
    cta: "Start 7-Day Free Trial",
    disabled: false,
    highlight: false,
    badge: "Save 17%",
    priceId: "pro_annual",
  },
];

const ProPage = () => {
  const { user } = useAuth();

  const handleCheckout = async (priceId: string, planName: string) => {
    trackEvent("stripe_checkout_initiated", { plan: planName });
    try {
      const { url } = await createCheckoutSession(priceId);
      if (url) window.location.href = url;
    } catch (e) {
      console.error("Checkout error:", e);
    }
  };

  return (
    <div className="px-4 py-8 max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-foreground">Upgrade to HedgeFun Pro</h1>
        <p className="text-sm text-muted-foreground mt-2">Get the full power of HedgeFun with real-time data, unlimited AI, and advanced tools.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={cn(
              "fintech-card p-5 flex flex-col relative",
              plan.highlight && "border-2 border-accent-blue"
            )}
          >
            {plan.badge && (
              <span className={cn(
                "absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-0.5 rounded-full",
                plan.badge === "Most Popular" ? "bg-accent-blue text-primary-foreground" : "bg-green-bg text-green"
              )}>
                {plan.badge}
              </span>
            )}
            <h3 className="text-base font-bold text-foreground">{plan.name}</h3>
            <div className="mt-2 mb-4">
              <span className="text-2xl font-bold text-foreground">{plan.price}</span>
              <span className="text-sm text-muted-foreground">{plan.period}</span>
            </div>
            <ul className="space-y-2 flex-1 mb-4">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="h-4 w-4 text-green shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <Button
              className={cn(
                "w-full",
                plan.highlight ? "bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground" : ""
              )}
              variant={plan.highlight ? "default" : "outline"}
              disabled={plan.disabled}
              onClick={() => plan.priceId && handleCheckout(plan.priceId, plan.name)}
            >
              {plan.cta}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProPage;
