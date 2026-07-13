import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

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

type BriefState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "unauth" }
  | { kind: "upgrade" }
  | {
      kind: "available";
      content: string;
      generatedAtEt: string;
      previousTradingDay: boolean;
      briefDateDisplay: string | null;
    }
  | { kind: "notice"; message: string; refreshable: boolean }
  | { kind: "error"; message: string; refreshable: boolean };

const REFRESHABLE_CODES = new Set(["brief_not_ready", "pm_not_released"]);

function formatEt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// Safely format a YYYY-MM-DD backend date string without timezone shift.
function formatBriefDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return dateStr;
  const [, y, mo, d] = m;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const idx = parseInt(mo, 10) - 1;
  return `${months[idx] ?? mo} ${parseInt(d, 10)}, ${y}`;
}

export function AIBriefCard({ isPro, config, briefType }: AIBriefCardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<BriefState>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const fetchBrief = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setState({ kind: "loading" });

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        setState({ kind: "unauth" });
        return;
      }

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-daily-brief`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ briefType }),
          signal: ctrl.signal,
        },
      );

      const body = await resp.json().catch(() => ({}));

      if (resp.status === 401) {
        setState({ kind: "unauth" });
        return;
      }
      if (resp.status === 403) {
        setState({ kind: "upgrade" });
        return;
      }
      if (resp.status === 200) {
        if (body?.available === true) {
          setState({
            kind: "available",
            content: typeof body.content === "string" ? body.content : "",
            generatedAtEt: body.generated_at ? formatEt(body.generated_at) : "",
            previousTradingDay: body.previous_trading_day === true,
            briefDateDisplay: formatBriefDate(body.brief_date),
          });
          return;
        }
        const code: string = typeof body?.code === "string" ? body.code : "";
        switch (code) {
          case "brief_not_ready":
            setState({ kind: "notice", message: "No brief is available yet.", refreshable: true });
            return;
          case "pm_not_released":
            setState({ kind: "notice", message: "The PM brief has not been released.", refreshable: true });
            return;
          case "weekend_no_am_brief":
            setState({ kind: "notice", message: "No AM brief on weekends.", refreshable: false });
            return;
          case "previous_report_unavailable":
            setState({ kind: "notice", message: "The previous Friday report is unavailable.", refreshable: false });
            return;
          case "invalid_brief_provenance":
            setState({ kind: "notice", message: "Brief unavailable.", refreshable: false });
            return;
          default:
            setState({ kind: "error", message: "Couldn't load the brief.", refreshable: true });
            return;
        }
      }
      // 5xx / other
      setState({ kind: "error", message: "Couldn't load the brief.", refreshable: true });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      if ((err as { name?: string })?.name === "AbortError") {
        return;
      }
      setState({ kind: "error", message: "Couldn't load the brief.", refreshable: true });
    }
  }, [briefType]);

  useEffect(() => {
    if (!user) {
      setState({ kind: "unauth" });
      return;
    }
    fetchBrief();
    return () => {
      abortRef.current?.abort();
    };
  }, [user, fetchBrief]);

  // Focus-refetch only for refreshable pending/error states.
  useEffect(() => {
    const onFocus = () => {
      const refreshable =
        (state.kind === "notice" && state.refreshable) ||
        (state.kind === "error" && state.refreshable);
      if (refreshable) fetchBrief();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [state, fetchBrief]);

  const canRefresh =
    (state.kind === "notice" && state.refreshable) ||
    (state.kind === "error" && state.refreshable);

  const timestampLabel = config.aiCardTimestampLabel ?? "Generated at";

  const renderBody = () => {
    switch (state.kind) {
      case "idle":
      case "loading":
        return <p className="text-sm leading-relaxed text-foreground/80">Loading brief…</p>;
      case "unauth":
        return <p className="text-sm leading-relaxed text-foreground/80">Sign in to view</p>;
      case "upgrade":
        return (
          <div className="flex flex-col items-start gap-2">
            {config.aiCardGateHeading && (
              <h4 className="text-base font-semibold text-foreground">{config.aiCardGateHeading}</h4>
            )}
            {config.aiCardGateBody && (
              <p className="text-xs text-muted-foreground">{config.aiCardGateBody}</p>
            )}
            <button
              onClick={() => navigate("/pro")}
              className="mt-1 bg-accent-blue text-white text-[13px] font-semibold px-5 py-2 rounded-md hover:opacity-90 transition-opacity duration-200"
            >
              {config.upgradeCta ?? "Request Pro Access"}
            </button>
          </div>
        );
      case "available":
        return (
          <div className="flex flex-col gap-2">
            {state.previousTradingDay && state.briefDateDisplay && (
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Last trading-day report · {state.briefDateDisplay}
              </div>
            )}
            <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
              {state.content || config.aiCardPlaceholderText}
            </p>
          </div>
        );
      case "notice":
      case "error":
        return (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm leading-relaxed text-foreground/80">{state.message}</p>
            {canRefresh && (
              <button
                onClick={() => fetchBrief()}
                className="text-xs font-medium text-accent-blue hover:underline"
              >
                Check again
              </button>
            )}
          </div>
        );
    }
  };

  const timestampText =
    state.kind === "available" && state.generatedAtEt ? state.generatedAtEt : "—";

  // isPro is presentation-only — no fetch gate, no blur overlay.
  void isPro;

  return (
    <div className="relative rounded-lg border border-border bg-card p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold tracking-wide">{config.aiCardTitle}</h3>
        <span className="text-[11px] text-muted-foreground">
          {timestampLabel} {timestampText}
        </span>
      </div>
      {renderBody()}
    </div>
  );
}
