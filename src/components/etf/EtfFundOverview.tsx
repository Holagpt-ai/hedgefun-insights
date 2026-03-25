import { Badge } from "@/components/ui/badge";

const FUND_INFO: Record<string, {
  description: string;
  strategy: string;
  benchmark: string;
  assetClass: string;
  category: string;
  region: string;
  style: string;
  provider: string;
  dividendYield: string;
  peRatio: string;
  beta: string;
  numHoldings: string;
}> = {
  SPY: {
    description: "The SPDR S&P 500 ETF Trust is the oldest and most widely traded exchange-traded fund in the United States. It seeks to provide investment results that correspond to the price and yield performance of the S&P 500 Index.",
    strategy: "Passive — full replication of the S&P 500 Index",
    benchmark: "S&P 500",
    assetClass: "Equity",
    category: "Large Cap Blend",
    region: "United States",
    style: "Blend",
    provider: "State Street Global Advisors",
    dividendYield: "1.28%",
    peRatio: "23.8",
    beta: "1.00",
    numHoldings: "503",
  },
  QQQ: {
    description: "The Invesco QQQ Trust tracks the Nasdaq-100 Index, which includes 100 of the largest non-financial companies listed on the Nasdaq stock exchange. It is heavily weighted toward technology and growth-oriented companies.",
    strategy: "Passive — full replication of the Nasdaq-100 Index",
    benchmark: "Nasdaq-100",
    assetClass: "Equity",
    category: "Large Cap Growth",
    region: "United States",
    style: "Growth",
    provider: "Invesco",
    dividendYield: "0.56%",
    peRatio: "31.2",
    beta: "1.14",
    numHoldings: "101",
  },
  DIA: {
    description: "The SPDR Dow Jones Industrial Average ETF Trust tracks the Dow Jones Industrial Average, a price-weighted index of 30 large-cap U.S. blue-chip companies spanning all sectors except transportation and utilities.",
    strategy: "Passive — full replication of the DJIA",
    benchmark: "Dow Jones Industrial Average",
    assetClass: "Equity",
    category: "Large Cap Value",
    region: "United States",
    style: "Value",
    provider: "State Street Global Advisors",
    dividendYield: "1.72%",
    peRatio: "20.6",
    beta: "0.92",
    numHoldings: "30",
  },
  IWM: {
    description: "The iShares Russell 2000 ETF provides exposure to small-cap U.S. equities by tracking the Russell 2000 Index. It offers broad diversification across approximately 2,000 of the smallest companies in the Russell 3000 Index.",
    strategy: "Passive — sampled replication of the Russell 2000 Index",
    benchmark: "Russell 2000",
    assetClass: "Equity",
    category: "Small Cap Blend",
    region: "United States",
    style: "Blend",
    provider: "BlackRock (iShares)",
    dividendYield: "1.34%",
    peRatio: "15.4",
    beta: "1.22",
    numHoldings: "1,974",
  },
};

interface Props {
  symbol: string;
}

export function EtfFundOverview({ symbol }: Props) {
  const info = FUND_INFO[symbol];
  if (!info) return null;

  const details = [
    { label: "Provider", value: info.provider },
    { label: "Benchmark", value: info.benchmark },
    { label: "Category", value: info.category },
    { label: "Asset Class", value: info.assetClass },
    { label: "Region", value: info.region },
    { label: "Style", value: info.style },
    { label: "Holdings", value: info.numHoldings },
    { label: "Dividend Yield", value: info.dividendYield },
    { label: "P/E Ratio", value: info.peRatio },
    { label: "Beta", value: info.beta },
    { label: "Strategy", value: info.strategy },
  ];

  return (
    <div className="mb-6 space-y-4">
      {/* Fund Description */}
      <div>
        <h2 className="text-[1rem] font-bold text-foreground mb-2">About This Fund</h2>
        <p className="text-[0.8125rem] text-muted-foreground leading-relaxed">{info.description}</p>
      </div>

      {/* Fund Details Grid */}
      <div>
        <h2 className="text-[1rem] font-bold text-foreground mb-2">Fund Details</h2>
        <div className="border border-border rounded-[var(--radius)] overflow-hidden">
          {details.map((d, i) => (
            <div
              key={d.label}
              className={`flex items-center justify-between px-3 py-2 text-[0.8125rem] ${
                i % 2 === 0 ? "bg-muted/30" : ""
              }`}
            >
              <span className="text-muted-foreground">{d.label}</span>
              <span className="text-foreground font-medium">{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
