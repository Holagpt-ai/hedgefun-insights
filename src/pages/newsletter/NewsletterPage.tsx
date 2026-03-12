import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AuthModals } from "@/components/auth/AuthModals";

export default function NewsletterPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "duplicate" | "error" | "invalid">("idle");
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);

  const handleSubmit = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setStatus("invalid");
      return;
    }
    setLoading(true);
    setStatus("idle");
    const { error } = await supabase.from("newsletter_subscribers" as any).insert({
      email: email.trim().toLowerCase(),
      source: "newsletter_page",
    } as any);
    setLoading(false);
    if (error) {
      if (error.code === "23505") {
        setStatus("duplicate");
      } else {
        setStatus("error");
      }
    } else {
      setStatus("success");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Minimal header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-6 shrink-0">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg text-foreground">
          <img src="/logo.svg" alt="HedgeFun" className="h-7 w-7" />
          <span>HedgeFun</span>
        </Link>
        <button
          onClick={() => setAuthMode("login")}
          className="text-sm font-medium text-foreground hover:text-primary transition-colors"
        >
          Log In
        </button>
      </header>

      {/* Centered content */}
      <main className="flex-1 w-full max-w-[560px] mx-auto px-6 pt-16 pb-12">
        <h1 className="text-[2rem] font-bold text-foreground text-center mb-6">
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
          <p className="text-sm text-green-600 mt-2">✓ You're subscribed! Check your inbox for a confirmation.</p>
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
          Trusted by 218,783+ investors.
        </p>
        <p className="text-sm text-muted-foreground text-center mt-2">
          <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
        </p>
      </main>

      {/* Bottom bar */}
      <div className="fixed bottom-0 w-full text-center py-3 border-t border-border bg-background">
        <Link to="/privacy" className="text-[0.8125rem] text-muted-foreground hover:underline">
          Do Not Sell or Share my information
        </Link>
      </div>

      <AuthModals mode={authMode} onClose={() => setAuthMode(null)} onSwitch={setAuthMode} />
    </div>
  );
}
