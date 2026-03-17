import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { AdBanner } from "@/components/layout/AdBanner";


interface LinkSection {
  title: string;
  links: { label: string; to: string }[];
}

const SECTIONS: LinkSection[] = [
  {
    title: "Popular Lists",
    links: [
      { label: "Top-Rated Dividend Stocks", to: "/stocks/lists/top-dividend" },
      { label: "U.S. Companies With The Most Employees", to: "/stocks/lists/most-employees" },
      { label: "Stocks That Pay Monthly Dividends", to: "/stocks/lists/monthly-dividends" },
      { label: "Biggest Companies By Market Cap", to: "/stocks/lists/biggest-market-cap" },
      { label: "U.S. Companies With The Most Revenue", to: "/stocks/lists/most-revenue" },
      { label: "100 Oldest Publicly Traded Companies", to: "/stocks/lists/oldest-companies" },
      { label: "U.S. Companies That Pay The Highest Taxes", to: "/stocks/lists/highest-taxes" },
    ],
  },
  {
    title: "Market Cap Groups",
    links: [
      { label: "Mega Cap Stocks", to: "/stocks/lists/mega-cap" },
      { label: "Small-Cap Stocks", to: "/stocks/lists/small-cap" },
      { label: "Large-Cap Stocks", to: "/stocks/lists/large-cap" },
      { label: "Micro-Cap Stocks", to: "/stocks/lists/micro-cap" },
      { label: "Mid-Cap Stocks", to: "/stocks/lists/mid-cap" },
      { label: "Nano-Cap Stocks", to: "/stocks/lists/nano-cap" },
    ],
  },
  {
    title: "U.S. Exchanges",
    links: [
      { label: "Listed on NYSE", to: "/stocks/lists/nyse" },
      { label: "Listed on NYSE American", to: "/stocks/lists/nyse-american" },
      { label: "Listed on NASDAQ", to: "/stocks/lists/nasdaq" },
      { label: "Listed on OTC Markets", to: "/stocks/lists/otc" },
    ],
  },
  {
    title: "In Index",
    links: [
      { label: "NASDAQ 100", to: "/stocks/lists/nasdaq-100" },
      { label: "S&P 500", to: "/stocks/lists/sp-500" },
      { label: "Dow Jones", to: "/stocks/lists/dow-jones" },
    ],
  },
  {
    title: "Other Lists",
    links: [
      { label: "FAANG", to: "/stocks/lists/faang" },
      { label: "Oversold Stocks", to: "/stocks/lists/oversold" },
      { label: "Business Development Companies", to: "/stocks/lists/bdc" },
      { label: "Optionable Stocks", to: "/stocks/lists/optionable" },
      { label: "Closed End Funds", to: "/stocks/lists/closed-end" },
      { label: "Most Shorted Stocks", to: "/stocks/lists/most-shorted" },
      { label: "Dividend Kings", to: "/stocks/lists/dividend-kings" },
      { label: "Mutual Funds", to: "/stocks/lists/mutual-funds" },
      { label: "Magnificent Seven", to: "/stocks/lists/magnificent-seven" },
      { label: "Overbought Stocks", to: "/stocks/lists/overbought" },
      { label: "Penny Stocks", to: "/stocks/lists/penny-stocks" },
      { label: "All REITs", to: "/stocks/lists/reits" },
      { label: "Dividend Aristocrats", to: "/stocks/lists/dividend-aristocrats" },
      { label: "All SPACs", to: "/ipos/spac" },
    ],
  },
  {
    title: "ETF Lists",
    links: [
      { label: "New Launches", to: "/etfs/new" },
      { label: "Covered Call ETFs", to: "/etfs/covered-call" },
      { label: "Exchange-Traded Notes (ETNs)", to: "/etfs/etns" },
      { label: "Monthly Dividend ETFs", to: "/etfs/monthly-dividend" },
      { label: "Bitcoin ETFs", to: "/etfs/bitcoin" },
      { label: "Crypto ETFs", to: "/etfs/crypto" },
      { label: "Fixed Income ETFs", to: "/etfs/fixed-income" },
      { label: "Ethereum ETFs", to: "/etfs/ethereum" },
      { label: "Artificial Intelligence ETFs", to: "/etfs/ai" },
      { label: "XRP ETFs", to: "/etfs/xrp" },
      { label: "Australian ETFs", to: "/etfs/australian" },
      { label: "Canadian ETFs", to: "/etfs/canadian" },
      { label: "Weekly Dividend ETFs", to: "/etfs/weekly-dividend" },
      { label: "Sector ETFs", to: "/etfs/sector" },
    ],
  },
  {
    title: "Stocks Ranked by Market Cap",
    links: [
      { label: "Mobile Games", to: "/stocks/lists/mobile-games" },
      { label: "Robotics", to: "/stocks/lists/robotics" },
      { label: "Social Media", to: "/stocks/lists/social-media" },
      { label: "Gaming", to: "/stocks/lists/gaming" },
      { label: "Clean Energy", to: "/stocks/lists/clean-energy" },
      { label: "Pharmaceuticals", to: "/stocks/lists/pharma" },
      { label: "E-Sports", to: "/stocks/lists/esports" },
      { label: "Rare Earth", to: "/stocks/lists/rare-earth" },
      { label: "Car Companies", to: "/stocks/lists/car-companies" },
      { label: "Online Dating", to: "/stocks/lists/online-dating" },
      { label: "Artificial Intelligence", to: "/stocks/lists/ai" },
      { label: "Virtual Reality", to: "/stocks/lists/vr" },
      { label: "Electric Vehicles", to: "/stocks/lists/ev" },
      { label: "Banks", to: "/stocks/lists/banks" },
      { label: "Weight Loss / GLP-1s", to: "/stocks/lists/glp1" },
      { label: "Sports Betting", to: "/stocks/lists/sports-betting" },
      { label: "Online Gambling", to: "/stocks/lists/online-gambling" },
      { label: "Metaverse", to: "/stocks/lists/metaverse" },
      { label: "Augmented Reality", to: "/stocks/lists/ar" },
    ],
  },
  {
    title: "Non-US Stocks Listed on US Exchanges",
    links: [
      { label: "United Kingdom", to: "/stocks/lists/uk" },
      { label: "Canada", to: "/stocks/lists/canada" },
      { label: "Ireland", to: "/stocks/lists/ireland" },
      { label: "India", to: "/stocks/lists/india" },
      { label: "Israel", to: "/stocks/lists/israel" },
      { label: "China", to: "/stocks/lists/china" },
    ],
  },
  {
    title: "International Exchanges",
    links: [
      { label: "List of Exchanges", to: "/stocks/exchanges" },
      { label: "Nasdaq Vilnius", to: "/stocks/lists/nasdaq-vilnius" },
      { label: "Dhaka Stock Exchange", to: "/stocks/lists/dhaka" },
      { label: "Spotlight Stock Market", to: "/stocks/lists/spotlight" },
      { label: "Munich Stock Exchange", to: "/stocks/lists/munich" },
      { label: "Indonesia Stock Exchange", to: "/stocks/lists/indonesia" },
      { label: "Cyprus Stock Exchange", to: "/stocks/lists/cyprus" },
      { label: "Iceland Stock Exchange", to: "/stocks/lists/iceland" },
      { label: "Deutsche Börse Xetra", to: "/stocks/lists/xetra" },
      { label: "Luxembourg Stock Exchange", to: "/stocks/lists/luxembourg" },
      { label: "Abu Dhabi Securities Exchange", to: "/stocks/lists/abu-dhabi" },
      { label: "Tanzania Stock Exchange", to: "/stocks/lists/tanzania" },
      { label: "Canadian Securities Exchange", to: "/stocks/lists/cse" },
      { label: "Ghana Stock Exchange", to: "/stocks/lists/ghana" },
      { label: "Mauritius Stock Exchange", to: "/stocks/lists/mauritius" },
      { label: "Ljubljana Stock Exchange", to: "/stocks/lists/ljubljana" },
      { label: "Johannesburg Stock Exchange", to: "/stocks/lists/johannesburg" },
      { label: "OTC Markets", to: "/stocks/lists/otc-markets" },
      { label: "Istanbul Stock Exchange", to: "/stocks/lists/istanbul" },
      { label: "Kuwait Stock Exchange", to: "/stocks/lists/kuwait" },
      { label: "Stuttgart Stock Exchange", to: "/stocks/lists/stuttgart" },
      { label: "Amman Stock Exchange", to: "/stocks/lists/amman" },
      { label: "Shanghai Stock Exchange", to: "/stocks/lists/shanghai" },
      { label: "Ho Chi Minh Stock Exchange", to: "/stocks/lists/hcm" },
    ],
  },
];

export default function StockListsPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");

  return (
    <div className="min-w-0">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/" className="text-[0.8125rem]">Home</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage className="text-[0.8125rem]">Lists</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <h1 className="text-[1.375rem] font-bold text-foreground mb-6">Stock Lists</h1>

        {/* Two-column layout */}
        <div className="flex flex-col md:flex-row gap-8">
          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-8">
            {SECTIONS.map((section) => (
              <div key={section.title}>
                <h2 className="text-base font-bold text-foreground mb-3 pb-2 border-b border-border">
                  {section.title}
                </h2>
                <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
                  {section.links.map((link) => (
                    <button
                      key={link.label}
                      onClick={() => navigate(link.to)}
                      className="text-left text-[0.875rem] text-primary hover:underline"
                    >
                      {link.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Right sidebar */}
          <div className="w-full md:w-[280px] md:flex-shrink-0 space-y-4">
            {/* Pro promo */}
            <div className="border border-border rounded-[var(--radius)] p-4">
              <h3 className="text-sm font-bold text-foreground mb-2">HedgeFun Pro</h3>
              <p className="text-[0.8125rem] text-muted-foreground mb-3">
                Upgrade now for unlimited access to all data and tools.
              </p>
              <Button
                onClick={() => navigate("/pro")}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-9 text-sm"
              >
                Sign Up Today
              </Button>
            </div>

            {/* Newsletter */}
            <div className="border border-border rounded-[var(--radius)] p-4">
              <h3 className="text-sm font-bold text-foreground mb-2">Market Newsletter</h3>
              <p className="text-[0.8125rem] text-muted-foreground mb-3">
                Get a daily email with the top market news in bullet point format.
              </p>
              <div className="flex flex-col gap-2">
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-9 text-sm"
                />
                <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-9 text-sm">
                  Subscribe
                </Button>
              </div>
            </div>

            {/* Stock Screener */}
            <div className="border border-border rounded-[var(--radius)] p-4">
              <h3 className="text-sm font-bold text-foreground mb-2">Stock Screener</h3>
              <p className="text-[0.8125rem] text-muted-foreground mb-3">
                Filter, sort and analyze all stocks to find your next investment.
              </p>
              <Button
                variant="outline"
                onClick={() => navigate("/screener")}
                className="w-full h-9 text-sm"
              >
                Open Screener
              </Button>
            </div>

            {/* Watchlist */}
            <div className="border border-border rounded-[var(--radius)] p-4">
              <h3 className="text-sm font-bold text-foreground mb-2">Watchlists</h3>
              <p className="text-[0.8125rem] text-muted-foreground mb-3">
                Save track of your favorite stocks in real time.
              </p>
              <Button
                variant="outline"
                onClick={() => navigate("/watchlist")}
                className="w-full h-9 text-sm"
              >
                Sign Up Free
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AdBanner />
      <Footer />
    </div>
  );
}
