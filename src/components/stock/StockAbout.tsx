import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink } from "lucide-react";

const EXCHANGE_MAP: Record<string, string> = {
  XNAS: "NASDAQ", XNYS: "NYSE", XASE: "NYSE American", ARCX: "NYSE Arca", BATS: "CBOE BZX",
};

const LOCALE_MAP: Record<string, string> = {
  us: "United States", gb: "United Kingdom", ca: "Canada", de: "Germany",
  fr: "France", jp: "Japan", cn: "China", hk: "Hong Kong", au: "Australia",
  ch: "Switzerland", kr: "South Korea", in: "India", br: "Brazil", ie: "Ireland",
  il: "Israel", nl: "Netherlands", se: "Sweden", sg: "Singapore", tw: "Taiwan",
};

function sicToSector(sicCode: number | string | undefined): string {
  const code = typeof sicCode === "string" ? parseInt(sicCode, 10) : sicCode;
  if (!code || isNaN(code)) return "n/a";
  if (code < 1000) return "Agriculture";
  if (code < 1500) return "Mining & Extraction";
  if (code < 1800) return "Construction";
  if (code < 4000) return "Manufacturing";
  if (code < 5000) return "Transportation & Utilities";
  if (code < 5200) return "Wholesale Trade";
  if (code < 6000) return "Retail Trade";
  if (code < 6800) return "Finance";
  if (code < 7000) return "Insurance & Real Estate";
  if (code < 9000) return "Services";
  return "Public Administration";
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "n/a";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function truncateDescription(desc: string): { short: string; full: string; needsMore: boolean } {
  const sentences = desc.match(/[^.!?]+[.!?]+/g) ?? [desc];
  if (sentences.length <= 3) return { short: desc, full: desc, needsMore: false };
  return { short: sentences.slice(0, 3).join("").trim(), full: desc, needsMore: true };
}

interface Props {
  details: any;
  ticker: string;
}

export default function StockAbout({ details, ticker }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!details) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const desc = details.description ?? "";
  const { short, full, needsMore } = truncateDescription(desc);

  const meta = [
    { label: "Industry", value: details.sic_description ?? "n/a" },
    { label: "Sector", value: sicToSector(details.sic_code) },
    { label: "IPO Date", value: formatDate(details.list_date) },
    { label: "Country", value: LOCALE_MAP[(details.locale ?? "").toLowerCase()] ?? details.locale ?? "n/a" },
    { label: "Stock Exchange", value: EXCHANGE_MAP[details.primary_exchange] ?? details.primary_exchange ?? "n/a" },
    { label: "Ticker Symbol", value: ticker },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-base font-bold text-foreground">About {ticker}</h3>

      {desc ? (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {expanded ? full : short}
          {needsMore && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="text-accent-blue hover:underline ml-1 font-medium"
            >
              [Read more]
            </button>
          )}
          {needsMore && expanded && (
            <button
              onClick={() => setExpanded(false)}
              className="text-accent-blue hover:underline ml-1 font-medium"
            >
              [Show less]
            </button>
          )}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No description available.</p>
      )}

      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
        {meta.map((m) => (
          <div key={m.label}>
            <p className="text-xs font-semibold text-muted-foreground">{m.label}</p>
            <p className="text-sm font-medium text-foreground">{m.value}</p>
          </div>
        ))}
        {details.homepage_url && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Website</p>
            <a
              href={details.homepage_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-accent-blue hover:underline inline-flex items-center gap-1"
            >
              {new URL(details.homepage_url).hostname}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
