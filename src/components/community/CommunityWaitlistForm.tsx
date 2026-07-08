import { useState } from "react";
import { Mail, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { subscribeToNewsletter } from "@/lib/newsletter";
import { COMMUNITY_WAITLIST_SOURCE, COMMUNITY_COPY } from "@/config/community.config";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CommunityWaitlistForm() {
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
    const res = await subscribeToNewsletter(trimmed, COMMUNITY_WAITLIST_SOURCE);
    setSubmitting(false);

    if (res.status === "success" || res.status === "duplicate") {
      setJoined(true);
      toast({
        title: "You're on the Community waitlist.",
        description:
          res.status === "duplicate"
            ? "You were already subscribed — we'll notify you when Community launches."
            : "We'll let you know when Community launches.",
      });
    } else if (res.status === "invalid") {
      setError("Please enter a valid email.");
    } else {
      toast({
        title: "Something went wrong",
        description: "We couldn't add you to the waitlist. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (joined) {
    return (
      <div className="rounded-lg border border-accent-blue/30 bg-accent-blue-light/50 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <Check className="h-4 w-4 text-accent-blue" />
          <h2 className="text-sm font-semibold text-foreground">
            You're on the Community waitlist.
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          We'll notify you when Community launches. {COMMUNITY_COPY.waitlistNote}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-surface-card p-4 sm:p-5"
    >
      <div className="flex items-center gap-2 mb-2">
        <Mail className="h-4 w-4 text-accent-blue" />
        <h2 className="text-sm font-semibold text-foreground">Join the Community waitlist</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Be first to know when Community launches. {COMMUNITY_COPY.waitlistNote}
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
          {submitting ? "Joining…" : "Join Community Waitlist"}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-red-600 mt-2">{error}</p>
      )}
    </form>
  );
}
