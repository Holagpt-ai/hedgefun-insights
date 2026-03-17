import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";


function ToolCard({ title, description, route }: { title: string; description: string; route: string }) {
  return (
    <Link
      to={route}
      className="block relative border border-border rounded-md p-5 bg-card cursor-pointer transition-all duration-150 hover:border-primary hover:shadow-sm"
    >
      <ArrowUpRight className="absolute top-4 right-4 h-4 w-4 text-muted-foreground" />
      <h3 className="text-base font-bold text-foreground pr-6">{title}</h3>
      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{description}</p>
    </Link>
  );
}

export default function ToolsPage() {
  return (
    <>
      <div className="w-full max-w-5xl mx-auto px-4 md:px-6 py-8">
        <title>Tools | HedgeFun</title>
        <h1 className="text-[1.75rem] font-bold text-foreground border-b-2 border-border pb-3 mb-8">Tools</h1>

        {/* Screeners */}
        <section className="mb-10">
          <h2 className="text-lg font-bold text-foreground mb-4">Screeners</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ToolCard title="Stock Screener" description="Filter, sort, and analyze stocks across a wide range of financial metrics." route="/screener" />
            <ToolCard title="ETF Screener" description="Explore exchange-traded funds with filters for performance, holdings, and strategy." route="/etf/screener" />
            <ToolCard title="IPO Screener" description="Browse recent IPOs and narrow the list by deal size, exchange, and other details." route="/ipos/screener" />
          </div>
        </section>

        {/* Comparison Tools */}
        <section className="mb-10">
          <h2 className="text-lg font-bold text-foreground mb-4">Comparison Tools</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ToolCard title="Stock Comparison Tool" description="Compare two or more stocks to evaluate performance, valuation, and fundamentals." route="/stocks/compare" />
            <ToolCard title="ETF Comparison Tool" description="Compare funds side-by-side to review total returns, dividends, holdings and more." route="/etf/compare" />
          </div>
        </section>

        {/* Calculators */}
        <section className="mb-10">
          <h2 className="text-lg font-bold text-foreground mb-4">Calculators</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ToolCard title="CAGR Calculator" description="Calculate the compound annual growth rate over a number of periods." route="/tools/cagr-calculator" />
            <ToolCard title="Dividend Calculator" description="Estimate dividend income and portfolio growth over time." route="/tools/dividend-calculator" />
          </div>
        </section>

        {/* Lookup Tools */}
        <section className="mb-10">
          <h2 className="text-lg font-bold text-foreground mb-4">Lookup Tools</h2>
          <div className="max-w-xs">
            <ToolCard title="Symbol Lookup" description="Search for a ticker symbol, company name, ETF, or fund." route="/tools/symbol-lookup" />
          </div>
        </section>
      </div>
      <Footer />
    </>
  );
}
