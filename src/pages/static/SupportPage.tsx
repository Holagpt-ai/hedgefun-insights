import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MessageCircle, Star, BarChart3, ClipboardList, Newspaper, Shield } from "lucide-react";
import { AdBanner } from "@/components/layout/AdBanner";

const CATEGORIES = [
  { icon: MessageCircle, title: "Getting Started", description: "Account setup, signing in, and navigating HedgeFun", to: "/faq#getting-started" },
  { icon: Star, title: "HedgeFun Pro", description: "Billing, subscription management, and Pro features", to: "/faq#pro" },
  { icon: BarChart3, title: "Data & Charts", description: "Understanding market data, charts, and indicators", to: "/faq#data" },
  { icon: ClipboardList, title: "Watchlist", description: "Adding stocks, managing your watchlist", to: "/faq#getting-started" },
  { icon: Newspaper, title: "Market Newsletter", description: "Subscribing, unsubscribing, delivery issues", to: "/faq#getting-started" },
  { icon: Shield, title: "Privacy & Security", description: "Account security, data privacy, and permissions", to: "/faq#technical" },
];

export default function SupportPage() {
  const [search, setSearch] = useState("");

  useEffect(() => {
    document.title = "Get Support | HedgeFun";
  }, []);

  const filtered = CATEGORIES.filter(
    (cat) =>
      cat.title.toLowerCase().includes(search.toLowerCase()) ||
      cat.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
    <div className="max-w-[800px] mx-auto px-6 py-12">
      <h1 className="text-[1.75rem] font-bold text-foreground border-b-2 border-border pb-3 mb-8">
        Help & Support
      </h1>

      {/* Search bar */}
      <div className="max-w-[600px] mx-auto mb-10 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search for help..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Help categories */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          {filtered.map((cat, i) => (
            <Link
              key={i}
              to={cat.to}
              className="border border-border rounded-md p-5 text-center hover:border-primary transition-colors"
            >
              <cat.icon className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
              <h3 className="text-base font-bold mb-1">{cat.title}</h3>
              <p className="text-sm text-muted-foreground">{cat.description}</p>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-center text-muted-foreground mb-12">
          No results found — try a different search term
        </p>
      )}

      {/* Still need help */}
      <div className="text-center py-8 border-t border-border">
        <h2 className="text-[1.125rem] font-bold mb-2">Still need help?</h2>
        <p className="text-muted-foreground mb-4">
          Contact our support team and we'll get back to you within 1–2 business days.
        </p>
        <Button asChild className="mb-3">
          <Link to="/contact">Contact Us</Link>
        </Button>
        <p className="text-sm text-muted-foreground">
          Or email us at{" "}
          <a href="mailto:info@hedgefun.fun" className="text-primary hover:underline">
            info@hedgefun.fun
          </a>
        </p>
        <div className="flex items-center justify-center gap-4 mt-4">
          <a href="https://facebook.com/hedgefun" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">Facebook</a>
          <a href="https://twitter.com/hedgefun" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">Twitter</a>
        </div>
      </div>

    </div>
    
      <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
        <AdBanner slot="bottom" />
      </div>
    </>
  );
}
