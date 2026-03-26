import { useEffect } from "react";
import { Link } from "react-router-dom";
import { AdBanner } from "@/components/layout/AdBanner";


export default function AboutPage() {
  useEffect(() => {
    document.title = "About HedgeFun | HedgeFun";
  }, []);

  return (
    <>
    <div className="max-w-[800px] mx-auto px-6 py-12">
      <h1 className="text-[1.75rem] font-bold text-foreground border-b-2 border-border pb-3 mb-8">
        About HedgeFun
      </h1>

      <div className="text-base leading-[1.6] text-foreground space-y-4">
        <p>
          HedgeFun is a financial data platform built for everyday investors. We provide real-time stock quotes, ETF data, IPO tracking, market movers, earnings calendars, and powerful screening tools — all in one place.
        </p>
        <p>
          Our mission is to make professional-grade financial data accessible to everyone, not just Wall Street insiders.
        </p>

        <h2 className="text-[1.125rem] font-bold text-foreground pt-4">What We Offer</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Real-time stock and ETF data powered by Polygon.io</li>
          <li>Comprehensive stock screener with 297+ filters</li>
          <li>IPO calendar, statistics, and screener</li>
          <li>Market movers: gainers, losers, most active, premarket, and after-hours</li>
          <li>Technical charting with drawing tools and indicators</li>
          <li>Daily market newsletter delivered every morning before the open</li>
          <li>HedgeFun Pro for unlimited access to all data and tools</li>
        </ul>

        <h2 className="text-[1.125rem] font-bold text-foreground pt-4">Contact</h2>
        <p>
          For inquiries, please visit our{" "}
          <Link to="/contact" className="text-primary hover:underline">Contact Us</Link>{" "}
          page or email us at{" "}
          <a href="mailto:info@hedgefun.fun" className="text-primary hover:underline">info@hedgefun.fun</a>
        </p>

        <h2 className="text-[1.125rem] font-bold text-foreground pt-4">Address</h2>
        <p>
          HedgeFun<br />
          1631 Del Prado Blvd S. #1124<br />
          Cape Coral, FL 33990
        </p>
      </div>

    </div>
    
      <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
        <AdBanner slot="bottom" />
      </div>
    </>
  );
}
