import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface AIBriefCardProps {
  isPro: boolean;
  config: {
    aiCardTitle: string;
    aiCardPlaceholderText: string;
    aiCardTimestampLabel?: string;
    aiCardGateHeading?: string;
    aiCardGateBody?: string;
    upgradeCta?: string;
    upgradeLink?: string;
  };
  briefType: "am" | "pm";
}

export function AIBriefCard({ isPro, config, briefType }: AIBriefCardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [content, setContent] = useState("");
  const [timestamp, setTimestamp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBrief = async () => {
      try {
        setLoading(true);
        setError(null);

        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-daily-brief`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ briefType }),
          }
        );

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${resp.status}`);
        }

        const data = await resp.json();
        setContent(data.content);
        setTimestamp(
          new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZone: "America/New_York",
          })
        );
      } catch (err) {
        console.error("Failed to fetch daily brief:", err);
        setError(err instanceof Error ? err.message : "Failed to load brief");
      } finally {
        setLoading(false);
      }
    };

    if (user && isPro) {
      fetchBrief();
    }
  }, [briefType, user, isPro]);

  const displayText = loading
    ? "Generating brief…"
    : error
      ? `Error: ${error}`
      : content || config.aiCardPlaceholderText;

  return (
    <div className="relative rounded-lg border border-border bg-card p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold tracking-wide">{config.aiCardTitle}</h3>
        {isPro && (
          <span className="text-[11px] text-muted-foreground">
            {config.aiCardTimestampLabel ?? "Generated at"} {timestamp || "—"}
          </span>
        )}
      </div>

      <p
        className={`text-sm leading-relaxed text-foreground/80 ${
          !isPro ? "blur-sm select-none pointer-events-none" : ""
        }`}
      >
        {displayText}
      </p>

      {!isPro && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-[2px] p-6 text-center">
          <span className="text-2xl">✦</span>
          {config.aiCardGateHeading && (
            <h4 className="text-base font-semibold text-foreground">
              {config.aiCardGateHeading}
            </h4>
          )}
          {config.aiCardGateBody && (
            <p className="text-xs text-muted-foreground max-w-md">{config.aiCardGateBody}</p>
          )}
          <button
            onClick={() => navigate("/pro")}
            className="mt-1 bg-accent-blue text-white text-[13px] font-semibold px-5 py-2 rounded-md hover:opacity-90 transition-opacity duration-200"
          >
            {config.upgradeCta ?? "Unlock PRO — $29/month"}
          </button>
          {config.upgradeLink && (
            <button
              onClick={() => navigate("/pro")}
              className="text-[11px] text-accent-blue underline"
            >
              {config.upgradeLink}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
