import { useNavigate } from "react-router-dom";
import { CheckCircle, BarChart3, Hash, Clock, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage,
} from "@/components/ui/breadcrumb";


const ANALYSTS = [
  { rank: 100, name: "Matthew Akers", rating: 4.79, company: "Wells Fargo", sector: "Industrials", success: 69.13, avgReturn: 19.65, ratings: 252, lastRating: "Jun 4, 2025" },
  { rank: 99, name: "David Konrad", rating: 4.79, company: "Keefe, Bruyette & Woods", sector: "Financials", success: 73.33, avgReturn: 17.74, ratings: 213, lastRating: "Feb 6, 2026" },
  { rank: 98, name: "Michael Lasser", rating: 4.78, company: "UBS", sector: "Consumer Discretionary", success: 74.26, avgReturn: 15.84, ratings: 528, lastRating: "Mar 5, 2026" },
  { rank: 97, name: "Craig Ellis", rating: 4.80, company: "B. Riley Securities", sector: "Technology", success: 61.52, avgReturn: 44.76, ratings: 521, lastRating: "Mar 6, 2026" },
  { rank: 96, name: "Rick Schafer", rating: 4.80, company: "Oppenheimer", sector: "Technology", success: 66.05, avgReturn: 22.34, ratings: 177, lastRating: "Mar 10, 2026" },
  { rank: 95, name: "Amit Daryanani", rating: 4.78, company: "Evercore ISI Group", sector: "Technology", success: 66.99, avgReturn: 20.47, ratings: 277, lastRating: "Mar 9, 2026" },
  { rank: 94, name: "Theresa Chen", rating: 4.76, company: "Barclays", sector: "Energy", success: 76.69, avgReturn: 16.12, ratings: 293, lastRating: "Mar 9, 2026" },
  { rank: 93, name: "Brian Nowak", rating: 4.75, company: "Morgan Stanley", sector: "Technology", success: 68.42, avgReturn: 21.58, ratings: 315, lastRating: "Mar 8, 2026" },
];

function StarRating({ value }: { value: number }) {
  const full = Math.floor(value);
  return (
    <span className="flex items-center gap-0.5 text-amber-500 text-xs">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className="h-3 w-3" fill={i < full ? "currentColor" : "none"} />
      ))}
      <span className="text-muted-foreground ml-1">({value})</span>
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

  return (
    <div className="min-w-0">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/" className="text-[0.8125rem]">Home</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage className="text-[0.8125rem]">Analysts</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <h1 className="text-[1.375rem] font-bold text-foreground">Top Wall Street Analysts</h1>
        <p className="text-sm text-muted-foreground mb-6">A list of Wall Street Analysts, ranked by their performance</p>

        {/* Table */}
        <div className="relative mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b-2 border-border">
                  <th className="text-right py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground w-12">#</th>
                  <th className="text-left py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">Analyst Name</th>
                  <th className="text-left py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">Company</th>
                  <th className="text-left py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">Main Sector</th>
                  <th className="text-right py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">Success Rate</th>
                  <th className="text-right py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">Average Return</th>
                  <th className="text-right py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">Ratings</th>
                  <th className="text-right py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">Last Rating</th>
                </tr>
              </thead>
              <tbody>
                {ANALYSTS.slice(0, 6).map((a) => (
                  <tr key={a.rank} className="border-b border-border hover:bg-surface transition-colors">
                    <td className="py-3 px-3 text-right text-[0.875rem] text-muted-foreground tabular-nums">{a.rank}</td>
                    <td className="py-3 px-3">
                      <button className="text-primary font-semibold hover:underline text-[0.875rem] block">{a.name}</button>
                      <StarRating value={a.rating} />
                    </td>
                    <td className="py-3 px-3 text-[0.875rem] text-foreground">{a.company}</td>
                    <td className="py-3 px-3 text-[0.875rem] text-foreground">{a.sector}</td>
                    <td className="py-3 px-3 text-right text-[0.875rem] tabular-nums text-green font-medium">{a.success.toFixed(2)}%</td>
                    <td className="py-3 px-3 text-right text-[0.875rem] tabular-nums text-green font-medium">{a.avgReturn.toFixed(2)}%</td>
                    <td className="py-3 px-3 text-right text-[0.875rem] tabular-nums">{a.ratings}</td>
                    <td className="py-3 px-3 text-right text-[0.875rem] text-muted-foreground">{a.lastRating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Fade + Paywall overlay */}
          <div className="relative -mt-8">
            <div className="h-16 bg-gradient-to-t from-background to-transparent" />
            <div className="border border-border rounded-[var(--radius)] p-8 text-center bg-background">
              <h2 className="text-[1.375rem] font-bold text-foreground mb-2">Upgrade to Pro</h2>
              <p className="text-sm text-muted-foreground mb-4">Get stock forecasts from Wall Street's highest rated professionals</p>
              <p className="text-sm font-bold text-foreground mb-4">Get much more with HedgeFun Pro</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 max-w-lg mx-auto mb-6 text-left">
                {[
                  "Investment ideas from the top Wall Street analysts",
                  "Advanced analyst filtering and sorting options",
                  "Unlimited access to all data and tools",
                  "Up to 30 years financial history",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="mt-1 text-xs">•</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <Button onClick={() => navigate("/pro")} className="bg-primary text-primary-foreground hover:bg-primary/90 px-8">
                Sign Up Today
              </Button>
            </div>
          </div>
        </div>

        {/* Analyst Star Rankings */}
        <div className="text-center mb-8">
          <h2 className="text-[1.375rem] font-bold text-foreground mb-2">Analyst Star Rankings</h2>
          <p className="text-sm text-muted-foreground mb-6">Our analyst star rankings are based on these four factors</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {RANKING_FACTORS.map((f) => (
              <div key={f.title} className="border border-border rounded-[var(--radius)] p-4 text-left">
                <div className="h-10 w-10 rounded-full bg-accent-blue-light flex items-center justify-center mb-3">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-sm font-bold text-foreground mb-1">{f.title}</h3>
                <p className="text-[0.8125rem] text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
