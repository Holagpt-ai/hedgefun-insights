import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Footer } from "@/components/layout/Footer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MessageCircle, Star, BarChart3, ClipboardList, Newspaper, Shield } from "lucide-react";

const CATEGORIES = [
  { icon: MessageCircle, title: "Getting Started", description: "Account setup, signing in, and navigating HedgeFun" },
  { icon: Star, title: "HedgeFun Pro", description: "Billing, subscription management, and Pro features" },
  { icon: BarChart3, title: "Data & Charts", description: "Understanding market data, charts, and indicators" },
  { icon: ClipboardList, title: "Watchlist", description: "Adding stocks, managing your watchlist" },
  { icon: Newspaper, title: "Market Newsletter", description: "Subscribing, unsubscribing, delivery issues" },
  { icon: Shield, title: "Privacy & Security", description: "Account security, data privacy, and permissions" },
];

export default function SupportPage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Get Support | HedgeFun";
  }, []);

  return (
    <div className="max-w-[800px] mx-auto px-6 py-12">
      <h1 className="text-[1.75rem] font-bold text-foreground border-b-2 border-border pb-3 mb-8">
        Help & Support
      </h1>

      {/* Search bar */}
      <div className="max-w-[600px] mx-auto mb-10 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search for help..." className="pl-10" disabled />
      </div>

      {/* Help categories */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
        {CATEGORIES.map((cat, i) => (
          <div
            key={i}
            className="border border-border rounded-md p-5 text-center hover:border-primary transition-colors cursor-default"
          >
            <cat.icon className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
            <h3 className="text-base font-bold mb-1">{cat.title}</h3>
            <p className="text-sm text-muted-foreground">{cat.description}</p>
          </div>
        ))}
      </div>

      {/* Still need help */}
      <div className="text-center py-8 border-t border-border">
        <h2 className="text-[1.125rem] font-bold mb-2">Still need help?</h2>
        <p className="text-muted-foreground mb-4">
          Contact our support team and we'll get back to you within 1–2 business days.
        </p>
        <Button onClick={() => navigate("/contact")} className="mb-3">
          Contact Us
        </Button>
        <p className="text-sm text-muted-foreground">
          Or email us at{" "}
          <a href="mailto:info@hedgefun.fun" className="text-primary hover:underline">
            info@hedgefun.fun
          </a>
        </p>
      </div>

    </div>
    <Footer />
  );
}
