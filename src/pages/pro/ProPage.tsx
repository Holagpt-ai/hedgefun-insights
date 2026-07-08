import { hasProAccess } from "@/lib/entitlement";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { AuthModals } from "@/components/auth/AuthModals";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { PRICING } from "@/config/pricing";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/* ── Plan data ── */

const FREE_FEATURES = [
  "Limited financial history",
  "Limited ETF data",
  "1 watchlist (25 stocks max)",
  "Ad supported",
  "Basic Stock Journal",
];

const PRO_FEATURES = [
  "Unlimited access to all data on 50,000+ stocks and ETFs",
  "Full Stock Journal — log trades, add tags, track performance",
  "Unlimited watchlists with unlimited stocks",
  "Ad-free experience across all pages",
  "Weekly live webinars — market analysis and trade setups",
  "Monthly workshops — options, technicals, risk management",
  "Trading psychology sessions — mindset and discipline coaching",
  "Live community access — share trades, get feedback",
  "Priority support",
  "Cancel anytime — no commitment",
];

const UNLIMITED_FEATURES = [
  "Everything in Pro, plus...",
  "Unlimited downloads",
  "API data access",
  "White-glove onboarding call",
  "Dedicated support channel",
];


const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "Is there an annual option?",
    a: `Yes. The annual plan is $${PRICING.pro.annual}/year, equivalent to getting 2 months free compared to monthly billing.`,
  },
  {
    q: "What is the Stock Journal?",
    a: "A private trade log where you record entries, exits, notes, and tags. View performance analytics over time — similar to TradeZella but built into HedgeFun.",
  },
  {
    q: "What are the webinars and workshops?",
    a: "Live weekly sessions covering market analysis, technical setups, options strategies, and risk management.",
  },
  {
    q: "What are the psychology sessions?",
    a: "Monthly group sessions focused on trading discipline, managing emotions, and building consistent habits.",
  },
  {
    q: "How do I sign up?",
    a: 'Click "Get Started Now" above and enter your details. You get access right away.',
  },
  {
    q: "Can I cancel at any time?",
    a: "Yes. There is a cancel button in your account settings. No fees, no penalties.",
  },
  {
    q: "What is your refund policy?",
    a: "We offer a 30-day money back guarantee, no questions asked.",
  },
];

/* ── Component ── */

const ProPage = () => {
  const { user, profile } = useAuth();
  const isPro = hasProAccess(profile?.plan);
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  const handleCheckout = () => {
    if (!user) {
      setAuthMode("signup");
      return;
    }
    toast({
      title: "Coming Soon",
      description: "Payment processing is being set up. Contact info@hedgefun.fun for early Pro access.",
    });
  };

  return (
    <div className="min-h-screen">
      {/* ── Hero header ── */}
      <div className="bg-[hsl(var(--muted)/0.3)] border-b border-border py-14 text-center px-4">
        <Breadcrumb className="justify-center mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild><Link to="/">Home</Link></BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Pro</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="text-[2rem] md:text-[2.5rem] font-bold text-foreground mb-3">
          HedgeFun Pro
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto text-[0.9375rem] leading-relaxed">
          Get unlimited access to all financial data and tools while supporting
          our mission of making the best investing platform for everyday traders.
        </p>
      </div>

      {/* ── Pricing cards ── */}
      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Billing toggle */}
        <div className="flex justify-center mb-8 gap-2">
          <Button
            variant={billing === "monthly" ? "default" : "outline"}
            size="sm"
            onClick={() => setBilling("monthly")}
          >
            Monthly
          </Button>
          <Button
            variant={billing === "annual" ? "default" : "outline"}
            size="sm"
            onClick={() => setBilling("annual")}
          >
            Annual
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-6 items-start mb-16">
          {/* Free */}
          <PricingCard
            title="Free"
            price="$0"
            features={FREE_FEATURES}
            ctaLabel="Create Account"
            ctaVariant="outline"
            onCta={() => setAuthMode("signup")}
          />

          {/* Pro — highlighted */}
          <PricingCard
            title="Pro"
            badge="Most Popular"
            price={billing === "monthly" ? `$${PRICING.pro.monthly}` : `$${PRICING.pro.annual}`}
            pricePeriod={billing === "monthly" ? "/month" : "/year"}
            priceSubtext={billing === "annual" ? "save 2 months free" : `$${PRICING.pro.annual}/year — save 2 months free`}
            features={PRO_FEATURES}
            ctaLabel={isPro ? "You're on Pro" : "Get Started Now"}
            ctaVariant="default"
            onCta={() => handleCheckout()}
            ctaDisabled={isPro}
            highlighted
            guarantee
          />

          {/* Unlimited */}
          <PricingCard
            title="Unlimited"
            badge="Best Value"
            badgeColor="green"
            price={billing === "monthly" ? `$${PRICING.unlimited.monthly}` : `$${PRICING.unlimited.annual}`}
            pricePeriod={billing === "monthly" ? "/month" : "/year"}
            priceSubtext={billing === "annual" ? "save 2 months free" : `$${PRICING.unlimited.annual}/year — save 2 months free`}
            features={UNLIMITED_FEATURES}
            ctaLabel="Choose Plan"
            ctaVariant="outline"
            onCta={() => handleCheckout()}
            guarantee
          />
        </div>

        {/* ── Common Questions ── */}
        <div className="max-w-2xl mx-auto mb-16">
          <h2 className="text-[1.5rem] font-bold text-foreground mb-8">
            Common Questions
          </h2>
          <div className="space-y-6">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i}>
                <h3 className="text-[0.9375rem] font-bold text-foreground mb-1.5">
                  {item.q}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom CTA ── */}
      <div className="bg-muted/40 border-t border-border py-14 text-center px-4">
        <h2 className="text-[1.5rem] font-bold text-foreground mb-3">
          Try HedgeFun Pro risk-free for 30 days!
        </h2>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto mb-6 leading-relaxed">
          Unlock unlimited access to all financial data and tools so you can
          trade smarter and grow consistently. 30-day money back guarantee, no
          questions asked.
        </p>
        <Button
          size="lg"
          className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground px-10"
          onClick={() => handleCheckout()}
        >
          Get Started Now
        </Button>
      </div>

      {/* Auth modals */}
      <AuthModals
        mode={authMode}
        onClose={() => setAuthMode(null)}
        onSwitch={setAuthMode}
      />
    </div>
  );
};

export default ProPage;

/* ── Pricing Card sub-component ── */

function PricingCard({
  title,
  badge,
  badgeColor,
  price,
  pricePeriod,
  priceSubtext,
  features,
  ctaLabel,
  ctaVariant,
  onCta,
  ctaDisabled,
  highlighted,
  guarantee,
}: {
  title: string;
  badge?: string;
  badgeColor?: "blue" | "green";
  price: string;
  pricePeriod?: string;
  priceSubtext?: string;
  features: string[];
  ctaLabel: string;
  ctaVariant: "default" | "outline";
  onCta: () => void;
  ctaDisabled?: boolean;
  highlighted?: boolean;
  guarantee?: boolean;
}) {
  return (
    <div
      className={cn(
        "border rounded-md bg-background flex flex-col relative",
        highlighted
          ? "border-2 border-accent-blue shadow-sm"
          : "border-border"
      )}
    >
      {badge && (
        <span className={cn(
          "absolute -top-3 right-4 text-primary-foreground text-xs font-semibold px-3 py-0.5 rounded",
          badgeColor === "green" ? "bg-[hsl(142,71%,35%)]" : "bg-accent-blue"
        )}>
          {badge}
        </span>
      )}

      <div className="p-6 flex flex-col flex-1">
        <h3 className="text-base font-bold text-foreground mb-4">{title}</h3>

        {/* Feature list */}
        <div className="flex-1 space-y-0">
          {features.map((f, i) => (
            <div
              key={i}
              className="py-2.5 text-sm text-foreground border-b border-border last:border-b-0"
            >
              {f}
            </div>
          ))}
        </div>

        {/* Price */}
        <p className="text-2xl font-bold text-foreground mt-4">
          {price}
          {pricePeriod && <span className="text-sm font-normal text-muted-foreground">{pricePeriod}</span>}
        </p>

        {priceSubtext && (
          <p className="text-sm text-muted-foreground mt-1 mb-1">
            {priceSubtext}
          </p>
        )}

        {/* CTA */}
        <Button
          variant={ctaVariant}
          className={cn(
            "w-full mt-4",
            ctaVariant === "default" &&
              "bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground"
          )}
          disabled={ctaDisabled}
          onClick={onCta}
        >
          {ctaLabel}
        </Button>

        {guarantee && (
          <p className="text-xs text-muted-foreground text-center mt-3">
            ✓ 30 Day Money Back Guarantee
          </p>
        )}
      </div>
    </div>
  );
}
