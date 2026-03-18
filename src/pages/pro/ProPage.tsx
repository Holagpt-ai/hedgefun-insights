import { useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/lib/analytics";
import { createCheckoutSession } from "@/lib/stripe";
import { cn } from "@/lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FREE_FEATURES = [
  "Real-time market data",
  "Top Gainers / Losers / Active",
  "Market Heatmap",
  "IPO Calendar",
  "ETF Screener",
  "Free Market Newsletter",
  "Stock Journal (basic)",
  "Community access (read-only)",
];

const PRO_FEATURES = [
  "Everything in Free",
  "Full Stock Journal (entries, tags, performance analytics)",
  "Live community access — chat, share trades, get feedback",
  "Weekly live webinars with market analysis",
  "Monthly workshops — options, technicals, risk management",
  "Trading psychology sessions — mindset and discipline coaching",
  "Ad-free experience across all pages",
  "Priority support",
];

const FAQ_ITEMS = [
  {
    q: "Can I cancel anytime?",
    a: "Yes, cancel from your account settings with no fees or penalties.",
  },
  {
    q: "What is the Stock Journal?",
    a: "A private trade log where you can record entries, exits, notes, tags, and view performance analytics over time.",
  },
  {
    q: "What are the webinars and workshops?",
    a: "Live sessions hosted weekly covering market analysis, technical setups, risk management, and options strategies.",
  },
  {
    q: "What are the psychology sessions?",
    a: "Monthly group sessions focused on trading discipline, managing emotions, and building consistent habits.",
  },
  {
    q: "Is my data safe?",
    a: "Yes. All data is encrypted and stored securely. We never sell your information.",
  },
];

const ProPage = () => {
  const { user, profile } = useAuth();
  const isPro = profile?.plan === "pro";

  const handleCheckout = async () => {
    trackEvent("stripe_checkout_initiated", { plan: "pro" });
    try {
      const { url } = await createCheckoutSession("pro_monthly");
      if (url) window.location.href = url;
    } catch (e) {
      console.error("Stripe checkout:", e);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <Breadcrumb className="mb-4">
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

      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-[1.75rem] font-bold text-foreground mb-2">HedgeFun Pro</h1>
        <p className="text-base text-muted-foreground max-w-xl mx-auto">
          Everything you need to trade smarter, think clearer, and grow consistently.
        </p>
      </div>

      {/* Pricing cards */}
      <div className="grid md:grid-cols-2 gap-6 mb-12 max-w-3xl mx-auto">
        {/* Free card */}
        <Card className="fintech-card">
          <CardContent className="p-6 flex flex-col h-full">
            <h3 className="text-lg font-bold text-foreground mb-1">Free</h3>
            <div className="mb-5">
              <span className="text-3xl font-bold text-foreground">$0</span>
              <span className="text-sm text-muted-foreground"> / month</span>
            </div>
            <ul className="space-y-2.5 flex-1 mb-6">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <Button variant="outline" className="w-full" disabled>
              Current Plan
            </Button>
          </CardContent>
        </Card>

        {/* Pro card */}
        <Card className="fintech-card border-2 border-primary relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-4 py-1 rounded-full">
            Most Popular
          </div>
          <CardContent className="p-6 flex flex-col h-full">
            <h3 className="text-lg font-bold text-foreground mb-1">Pro</h3>
            <div className="mb-1">
              <span className="text-3xl font-bold text-foreground">$19</span>
              <span className="text-sm text-muted-foreground"> / month</span>
            </div>
            <p className="text-xs text-muted-foreground mb-5">Cancel anytime. No commitment.</p>
            <ul className="space-y-2.5 flex-1 mb-6">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <Button
              className="w-full"
              disabled={isPro}
              onClick={handleCheckout}
            >
              {isPro ? "You're on Pro" : "Upgrade to Pro"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* FAQ */}
      <div className="max-w-3xl mx-auto mb-8">
        <h2 className="text-lg font-bold text-foreground mb-4">Frequently Asked Questions</h2>
        <Accordion type="single" collapsible className="w-full">
          {FAQ_ITEMS.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-sm font-semibold text-foreground">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
};

export default ProPage;
