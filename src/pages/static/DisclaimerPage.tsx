import { useEffect } from "react";
import { Footer } from "@/components/layout/Footer";

const SECTIONS = [
  {
    title: null,
    body: "All financial data provided on HedgeFun is sourced from third-party providers including Polygon.io and is believed to be reliable but is not guaranteed for accuracy or completeness.",
  },
  {
    title: "Not Financial Advice",
    body: "Nothing on HedgeFun constitutes financial, investment, tax, or legal advice. Data is provided for informational and educational purposes only. Past performance does not guarantee future results.",
  },
  {
    title: "Data Accuracy",
    body: "Stock prices, market data, and financial figures may be delayed or contain errors. Always verify critical data with official exchange sources before making any financial decision.",
  },
  {
    title: "IPO Data",
    body: "IPO dates and details are sourced from SEC filings and press releases. Dates are estimates and subject to change. Companies may postpone or withdraw their IPO plans.",
  },
  {
    title: "Analyst Ratings",
    body: "Analyst price targets and ratings are third-party opinions and do not represent the views of HedgeFun.",
  },
  {
    title: "Use at Your Own Risk",
    body: "You acknowledge that any reliance on data from HedgeFun is at your own risk. HedgeFun is not liable for any investment losses resulting from use of this data.",
  },
];

export default function DisclaimerPage() {
  useEffect(() => {
    document.title = "Data Disclaimer | HedgeFun";
  }, []);

  return (
    <div className="max-w-[800px] mx-auto px-6 py-12">
      <h1 className="text-[1.75rem] font-bold text-foreground border-b-2 border-border pb-3 mb-8">
        Data Disclaimer
      </h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: March 12, 2026</p>

      <div className="text-base leading-[1.6] text-foreground">
        {SECTIONS.map((s, i) => (
          <div key={i} className="mb-6">
            {s.title && <h2 className="text-[1.125rem] font-bold mb-2">{s.title}</h2>}
            <p>{s.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-16">
        <Footer />
      </div>
    </div>
  );
}
