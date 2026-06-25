import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";

type Status = "loading" | "success" | "error" | "missing";

export default function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<Status>("loading");
  const email = searchParams.get("email");
  const token = searchParams.get("token");

  useEffect(() => {
    if (!email || !token) {
      setStatus("missing");
      return;
    }

    const run = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/newsletter-unsubscribe`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ email, token }),
          }
        );
        if (res.ok) {
          setStatus("success");
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
    };

    run();
  }, [email, token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md border border-border rounded-lg overflow-hidden bg-card">
        {/* Header */}
        <div className="bg-[#0f172a] px-8 py-6">
          <span className="text-xl font-bold text-white">
            HedgeFun<span className="text-[#1d4ed8]">.</span>
          </span>
        </div>

        {/* Body */}
        <div className="px-8 py-8">
          {status === "loading" && (
            <>
              <h1 className="text-xl font-bold text-foreground mb-2">Unsubscribing...</h1>
              <p className="text-sm text-muted-foreground">Please wait a moment.</p>
            </>
          )}
          {status === "success" && (
            <>
              <h1 className="text-xl font-bold text-foreground mb-2">You've been unsubscribed.</h1>
              <p className="text-sm text-muted-foreground mb-6">
                You won't receive any more emails from HedgeFun Market Bullets. Changed your mind?
              </p>
              <Link
                to="/newsletter"
                className="inline-block bg-primary text-primary-foreground text-sm font-semibold px-5 py-2.5 rounded-md hover:bg-primary/90 transition-colors"
              >
                Resubscribe
              </Link>
            </>
          )}
          {status === "error" && (
            <>
              <h1 className="text-xl font-bold text-foreground mb-2">Something went wrong.</h1>
              <p className="text-sm text-muted-foreground mb-6">
                We couldn't process your request. Please try again or contact us.
              </p>
              <Link
                to="/"
                className="inline-block bg-primary text-primary-foreground text-sm font-semibold px-5 py-2.5 rounded-md hover:bg-primary/90 transition-colors"
              >
                Go to HedgeFun
              </Link>
            </>
          )}
          {status === "missing" && (
            <>
              <h1 className="text-xl font-bold text-foreground mb-2">Invalid unsubscribe link.</h1>
              <p className="text-sm text-muted-foreground mb-6">
                This link appears to be missing information. Please use the link from your email.
              </p>
              <Link
                to="/"
                className="inline-block bg-primary text-primary-foreground text-sm font-semibold px-5 py-2.5 rounded-md hover:bg-primary/90 transition-colors"
              >
                Go to HedgeFun
              </Link>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-border bg-muted/30">
          <p className="text-xs text-muted-foreground text-center">© 2026 HedgeFun.fun</p>
        </div>
      </div>
    </div>
  );
}
