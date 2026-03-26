import { useNavigate, Link } from "react-router-dom";
import { CheckCircle, BarChart3, Hash, Clock, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { ANALYSTS } from "@/data/analysts";
import { usePageSeo } from "@/hooks/usePageSeo";

function StarRating({ value }: { value: number }) {
  const full = Math.floor(value);
  return (
    <span className="flex items-center gap-0.5 text-amber-500 text-xs">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className="h-3 w-3" fill={i < full ? "currentColor" : "none"} />
      ))}
      <span className="text-muted-foreground ml-1">({value.toFixed(2)})</span>
    </span>
  );
}

const RANKING_FACTORS = [
  { icon: CheckCircle, title: "Success Rate", desc: "The percentage of ratings that are profitable." },
  { icon: BarChart3, title: "Average Return", desc: "The average percentage return within one year of the rating." },
  { icon: Hash, title: "Rating Count", desc: "The more ratings the analyst has provided, the higher the score." },
  { icon: Clock, title: "Recency", desc: "Ratings provided within the past year contribute to a higher score." },
];

export default function TopAnalystsPage() {
  const navigate = useNavigate();

  usePageSeo({
    title: "Top Wall Street Analysts | HedgeFun",
    description: "Wall Street analysts ranked by their stock picking performance. See success rates, average returns, and ratings history.",
  });

  return (
    <div className="min-w-0">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/" className="text-[0.8125rem]">Home</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage className="text-[0.8125rem]">Analysts</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <h1 className="text-[1.375rem] font-bold text-foreground">Top Wall Street Analysts</h1>
        <p className="text-sm text-muted-foreground mb-6">Wall Street analysts ranked by their performance</p>

        {/* Table */}
        <div className="border border-border rounded-lg overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground w-12">#</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Analyst</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground hidden md:table-cell">Sector</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Success</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Avg Return</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground hidden sm:table-cell">Ratings</th>
                </tr>
              </thead>
              <tbody>
                {ANALYSTS.map((a, i) => (
                  <tr
                    key={a.slug}
                    className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="text-right px-3 py-3 text-muted-foreground font-medium">{a.rank}</td>
                    <td className="px-3 py-3">
                      <Link
                        to={`/stocks/analysts/${a.slug}`}
                        className="text-sm font-semibold text-accent-blue hover:underline"
                      >
                        {a.name}
                      </Link>
                      <StarRating value={a.rating} />
                      <p className="text-xs text-muted-foreground mt-0.5">{a.firm}</p>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground hidden md:table-cell">{a.sector}</td>
                    <td className="text-right px-3 py-3 text-green font-medium">{a.successRate}%</td>
                    <td className="text-right px-3 py-3 text-green font-medium">{a.avgReturn.toFixed(2)}%</td>
                    <td className="text-right px-3 py-3 text-muted-foreground hidden sm:table-cell">{a.totalRatings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pro upsell */}
        <div className="relative border border-border rounded-lg p-6 text-center mb-8">
          <h2 className="text-lg font-bold mb-1">Upgrade to HedgeFun Pro</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Unlock full analyst rankings, advanced filtering, and unlimited data access.
          </p>
          <Button onClick={() => navigate("/pro")} className="bg-accent-blue hover:bg-accent-blue-hover text-white">
            Upgrade to Pro →
          </Button>
        </div>

        {/* Ranking factors */}
        <h2 className="text-lg font-bold mb-4">Analyst Star Rankings</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {RANKING_FACTORS.map((f) => (
            <div key={f.title} className="border border-border rounded-lg p-4">
              <f.icon className="h-6 w-6 text-accent-blue mb-2" />
              <h3 className="font-semibold text-sm mb-1">{f.title}</h3>
              <p className="text-xs text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
