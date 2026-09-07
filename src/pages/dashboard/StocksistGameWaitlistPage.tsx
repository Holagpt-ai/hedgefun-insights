import { useState } from "react";
import { Gamepad2, Info, Check, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { subscribeToNewsletter } from "@/lib/newsletter";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WAITLIST_SOURCE = "stocksist_game_waitlist";

export default function StocksistGameWaitlistPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) return setError("Email is required.");
    if (!EMAIL_RE.test(trimmed)) return setError("Please enter a valid email.");

    setSubmitting(true);
    const res = await subscribeToNewsletter(trimmed, WAITLIST_SOURCE);
    setSubmitting(false);

    if (res.status === "success" || res.status === "duplicate") {
      setJoined(true);
      toast({
        title: "You're on the Stocksist Game waitlist.",
        description:
          res.status === "duplicate"
            ? "You were already subscribed. We'll notify you when Stocksist Game launches."
            : "We'll notify you when Stocksist Game launches.",
      });
      return;
    }

    if (res.status === "invalid") {
      setError("Please enter a valid email.");
      return;
    }

    toast({
      title: "Something went wrong",
      description: "We couldn't add you to the waitlist. Please try again.",
      variant: "destructive",
    });
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <Gamepad2 className="h-5 w-5 text-accent-blue" />
          <h1 className="text-xl md:text-2xl font-semibold text-foreground">Stocksist Game</h1>
          <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-blue-light text-accent-blue">
            Coming Soon
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Be first to know when Stocksist Game launches. Compete in market challenges, build a
          virtual portfolio, track your ranking, and test your trading skills against other
          Stocksist users.
        </p>
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-accent-blue/30 bg-accent-blue-light/50 px-3.5 py-3">
        <Info className="h-4 w-4 text-accent-blue shrink-0 mt-0.5" />
        <div className="text-xs text-foreground leading-relaxed">
          You may receive the existing Stocksist welcome email after joining.
        </div>
      </div>

      {joined ? (
        <div className="rounded-lg border border-accent-blue/30 bg-accent-blue-light/50 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-1">
            <Check className="h-4 w-4 text-accent-blue" />
            <h2 className="text-sm font-semibold text-foreground">
              You're on the Stocksist Game waitlist.
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            We'll notify you when Stocksist Game launches. You may receive the existing Stocksist
            welcome email after joining.
          </p>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-border bg-surface-card p-4 sm:p-5"
        >
          <div className="flex items-center gap-2 mb-2">
            <Mail className="h-4 w-4 text-accent-blue" />
            <h2 className="text-sm font-semibold text-foreground">Join the Stocksist Game waitlist</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            No launch dates are being announced yet. Join to get notified when access opens.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              className="flex-1"
              disabled={submitting}
              aria-label="Email address"
              required
            />
            <Button
              type="submit"
              disabled={submitting}
              className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground shrink-0"
            >
              {submitting ? "Joining..." : "Join Game Waitlist"}
            </Button>
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </form>
      )}
    </div>
  );
}
