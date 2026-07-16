import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subscribeToNewsletter } from "@/lib/newsletter";
import { AuthModals } from "@/components/auth/AuthModals";
import { AdBanner } from "@/components/layout/AdBanner";
import { BRAND } from "@/config/brand";

function IPhoneMockup() {
  return (
    <div className="hidden md:flex items-center justify-center">
      {/* Phone frame */}
      <div
        className="relative w-[272px] rounded-[40px] border-[6px] border-gray-800 bg-background rotate-2 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.3)] overflow-hidden"
        style={{ height: "560px" }}
      >
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[28px] bg-gray-800 rounded-b-2xl z-10" />

        {/* Screen content */}
        <div className="relative h-full pt-[36px] px-3 pb-0 overflow-hidden">
          {/* Date */}
          <p className="text-[9px] text-muted-foreground text-center mb-2">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>

          {/* Logo */}
          <div className="flex items-center justify-center gap-1.5 mb-3">
            <div className="h-6 w-6 rounded bg-accent-blue flex items-center justify-center">
              <span className="text-[8px] font-bold text-white">{BRAND.initials}</span>
            </div>
            <span className="font-bold text-[11px] text-foreground">{BRAND.name}</span>
          </div>

          {/* Market Overview */}
          <div className="border border-border rounded-md p-2 mb-3">
            <p className="text-[9px] font-bold text-foreground mb-1.5">Market Overview</p>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { name: "S&P 500", val: "+1.45%" },
                { name: "Nasdaq", val: "+1.07%" },
                { name: "Dow", val: "+2.12%" },
              ].map((idx) => (
                <div key={idx.name} className="text-center">
                  <p className="text-[8px] text-muted-foreground">{idx.name}</p>
                  <p className="text-[10px] font-bold text-green-600">{idx.val}</p>
                </div>
              ))}
            </div>
          </div>

          {/* News */}
          <div className="border border-border rounded-md p-2">
            <p className="text-[9px] font-bold text-foreground mb-1.5">Stock & Market News</p>
            <ul className="space-y-2 text-[8px] leading-[1.4] text-foreground">
              <li>
                <span className="font-bold text-primary">NVDA:</span> Nvidia reports record data center revenue, beating analyst expectations.{" "}
                <span className="text-muted-foreground">Source: Reuters</span>
              </li>
              <li>
                <span className="font-bold text-primary">AAPL:</span> Apple announces new AI features for iPhone at developer conference.{" "}
                <span className="text-muted-foreground">Source: WSJ</span>
              </li>
              <li>
                <span className="font-bold text-primary">Fed:</span> Federal Reserve holds rates steady at current levels, signals caution.{" "}
                <span className="text-muted-foreground">Source: Bloomberg</span>
              </li>
              <li>
                <span className="font-bold text-primary">TSLA:</span> Tesla deliveries rise 15% in Q1, exceeding Wall Street forecasts.{" "}
                <span className="text-muted-foreground">Source: CNBC</span>
              </li>
            </ul>
          </div>

          {/* Fade overlay at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        </div>
      </div>
    </div>
  );
}

export default function NewsletterPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "duplicate" | "error" | "invalid">("idle");
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);

  const { data: subCountData } = useQuery({
    queryKey: ["subscriber-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("newsletter_subscribers")
        .select("*", { count: "exact", head: true })
        .is("unsubscribed_at", null);
      return count ?? 0;
    },
  });

  const displayCount = subCountData
    ? `${(Math.floor(subCountData / 100) * 100).toLocaleString()}+`
    : "21,200+";



  const handleSubmit = async () => {
    setLoading(true);
    setStatus("idle");
    const result = await subscribeToNewsletter(email, "newsletter_page");
    setLoading(false);
    setStatus(result.status);
  };

  useEffect(() => {
    document.title = "Stocksist Market Bullets | Stocksist";
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Minimal header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-6 shrink-0">
        <Link to="/" className="flex items-center font-bold text-lg text-foreground">
          <img src="/logo.svg" alt="Stocksist" className="h-8 w-auto" />
        </Link>
        <button
          onClick={() => setAuthMode("login")}
          className="text-sm font-medium text-foreground hover:text-primary transition-colors"
        >
          Log In
        </button>
      </header>

      {/* Two-column content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-6 pt-16 pb-12">
        <div className="grid md:grid-cols-[1fr_auto] gap-12 items-start">
          {/* Left column — existing content */}
          <div className="max-w-[560px]">
            <h1 className="text-[2rem] font-bold text-foreground text-center md:text-left mb-6">
              Stay informed in just 2 minutes
            </h1>

            <div className="text-base text-foreground leading-relaxed space-y-4">
              <p>
                HedgeFun Market Bullets is a free newsletter that makes it super easy to keep up
                with financial markets.
              </p>
              <p>
                Our summaries are presented in short, bullet-point format, so reading this
                newsletter will never feel like a chore.
              </p>
              <p>
                Let us read the news for you and filter out the noise, then we'll send you
                the bullet points. Here's what you'll get:
              </p>
            </div>

            <ul className="list-disc pl-5 my-4 text-base text-foreground leading-[1.7] space-y-2">
              <li>A quick overview of the market indexes.</li>
              <li>
                Short, scannable bullet points covering top market moving news and events,
                major earnings, today's IPOs, and more.
              </li>
              <li>
                We only use accurate, up-to-date info from the highest-quality sources (no
                clickbait).
              </li>
            </ul>

            <p className="text-base text-foreground leading-relaxed">
              The newsletter is completely free, delivered to your inbox every morning before
              the market opens, Monday to Friday.
            </p>

            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setStatus("idle"); }}
              placeholder="Enter your email"
              className="w-full h-12 border border-border rounded-md px-4 text-base bg-background text-foreground placeholder:text-muted-foreground mt-6 focus:outline-none focus:ring-2 focus:ring-ring"
            />

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full h-12 bg-primary text-primary-foreground text-base font-semibold rounded-md mt-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Subscribing..." : "Join Free"}
            </button>

            {status === "success" && (
              <p className="text-sm text-green-600 mt-2">✓ You're subscribed! Welcome email on its way.</p>
            )}
            {status === "duplicate" && (
              <p className="text-sm text-yellow-600 mt-2">You're already subscribed!</p>
            )}
            {status === "invalid" && (
              <p className="text-sm text-destructive mt-2">Please enter a valid email address.</p>
            )}
            {status === "error" && (
              <p className="text-sm text-destructive mt-2">Something went wrong. Please try again.</p>
            )}

            <p className="text-sm text-muted-foreground text-center mt-3">
              Trusted by {displayCount} Traders.
            </p>
            <p className="text-sm text-muted-foreground text-center mt-2">
              <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
            </p>
          </div>

          {/* Right column — iPhone mockup */}
          <IPhoneMockup />
        </div>
      </main>

      {/* Bottom bar */}
      <div className="fixed bottom-0 w-full text-center py-3 border-t border-border bg-background">
        <Link to="/privacy" className="text-[0.8125rem] text-muted-foreground hover:underline">
          Do Not Sell or Share my information
        </Link>
      </div>

      <AuthModals mode={authMode} onClose={() => setAuthMode(null)} onSwitch={setAuthMode} />
      <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
        <AdBanner slot="bottom" />
      </div>
    </div>
  );
}
