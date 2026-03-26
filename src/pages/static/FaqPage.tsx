import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AdBanner } from "@/components/layout/AdBanner";

const FAQ_SECTIONS = [
  {
    id: "getting-started",
    heading: "Getting Started",
    items: [
      { q: "What is HedgeFun?", a: "HedgeFun is a financial data platform providing real-time stock quotes, ETF data, IPO tracking, market movers, earnings calendars, screening tools, and more for everyday investors." },
      { q: "How do I create an account?", a: 'Click "Sign Up" in the top right corner. You can register with your email address. It\'s free.' },
      { q: "How do I add stocks to my Watchlist?", a: 'Sign in to your account, navigate to the Watchlist page, and use the "Add new stock..." search to find and add any ticker.' },
    ],
  },
  {
    id: "billing",
    heading: "Account & Billing",
    items: [
      { q: "Is HedgeFun free to use?", a: "Yes. Most features are free. HedgeFun Pro unlocks unlimited access to all data, advanced screener filters, analyst data, and up to 30 years of financial history." },
      { q: "How do I cancel my Pro subscription?", a: "You can cancel anytime from your Account Settings page. You'll retain Pro access until the end of your billing period." },
    ],
  },
  {
    id: "data",
    heading: "Data & Markets",
    items: [
      { q: "Where does HedgeFun get its data?", a: "Stock prices, ETF data, and market data are sourced from Polygon.io. News is aggregated from multiple financial sources. IPO data is sourced from SEC filings, NASDAQ, NYSE, and press releases." },
      { q: "How often is data updated?", a: "Real-time data is updated continuously during market hours. After-hours and premarket data updates every few minutes. Market news refreshes every 5 minutes." },
    ],
  },
  {
    id: "pro",
    heading: "HedgeFun Pro",
    items: [
      { q: "What is HedgeFun Pro?", a: "HedgeFun Pro is our premium subscription that gives you unlimited access to all data, analyst ratings, top stock picks, advanced filtering, and extended historical data. Visit our Pro page for pricing." },
    ],
  },
  {
    id: "technical",
    heading: "Technical & Security",
    items: [
      { q: "Is my data secure?", a: "Yes. We use industry-standard secure authentication and data storage. We never sell your personal data to third parties." },
      { q: "How do I advertise on HedgeFun?", a: "Visit our Advertise page or email info@hedgefun.fun for advertising inquiries." },
    ],
  },
];

export default function FaqPage() {
  const { hash } = useLocation();

  useEffect(() => {
    document.title = "FAQ | HedgeFun";
  }, []);

  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      }
    }
  }, [hash]);

  return (
    <>
    <div className="max-w-[800px] mx-auto px-6 py-12">
      <h1 className="text-[1.75rem] font-bold text-foreground border-b-2 border-border pb-3 mb-8">
        Frequently Asked Questions
      </h1>

      {FAQ_SECTIONS.map((section) => (
        <div key={section.id} className="mb-8">
          <h2 id={section.id} className="text-lg font-bold text-foreground mb-3 scroll-mt-20">
            {section.heading}
          </h2>
          <Accordion type="single" collapsible className="w-full">
            {section.items.map((item, i) => (
              <AccordionItem key={i} value={`${section.id}-${i}`} className="border-b border-border">
                <AccordionTrigger className="text-base font-semibold text-foreground py-4 hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-[0.9375rem] text-muted-foreground leading-[1.6] pb-4">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ))}
    </div>
    
      <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
        <AdBanner slot="bottom" />
      </div>
    </>
  );
}
