import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { summarizeBrief } from "@/lib/ai/evidence";
import { etTimestampLabel } from "@/lib/pre-market/builders";
import { getEtParts, isTradingDay, marketHolidayName, nextTradingDay } from "@/lib/market-calendar";

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
      evidenceCutoff: string | null;
    }
  | { kind: "notice"; message: string; refreshable: boolean; showAfterHoursCta?: boolean }
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

function longDateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(utc);
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

export interface BriefContextNotice {
  message: string;
  refreshable: boolean;
  showAfterHoursCta: boolean;
}

export function resolveAmBriefNoticeAt(now: Date): BriefContextNotice {
  const et = getEtParts(now);
  const tradingDay = isTradingDay(et.date, et.weekday);
  if (!tradingDay) {
    const next = nextTradingDay(et.date);
    const nextLabel = longDateLabel(next.date);
    const holiday = marketHolidayName(et.date);
    if (holiday) {
      return {
        message: `${holiday} — U.S. markets are closed today.\nPre-market reopens ${nextLabel} at 4:00 AM ET. The regular session opens at 9:30 AM ET.`,
        refreshable: false,
        showAfterHoursCta: false,
      };
    }
    return {
      message: `U.S. markets are closed today.\nThe next pre-market session begins ${nextLabel} at 4:00 AM ET. The regular session opens at 9:30 AM ET.`,
      refreshable: false,
      showAfterHoursCta: false,
    };
  }

  if (et.minutes >= 900) {
    return {
      message:
        "The AM Brief has expired.\nThe After-Hours workflow is now active. Review afternoon setups and prepare for the close.\nThe PM Brief will publish after the market closes.",
      refreshable: false,
      showAfterHoursCta: true,
    };
  }

  if (et.minutes >= 720) {
    return {
      message: "The AM Brief has expired.\nThe After-Hours workflow begins at 3:00 PM ET.",
      refreshable: false,
      showAfterHoursCta: true,
    };
  }

  return {
    message: "Today's AI Pre-Market Brief is being prepared. Check again shortly.",
    refreshable: true,
    showAfterHoursCta: false,
  };
}

export function AIBriefCard({ isPro, config, briefType }: AIBriefCardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<BriefState>({ kind: "idle" });
  const [briefExpanded, setBriefExpanded] = useState(false);
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
          const validType = body.brief_type === briefType;
          const validContent = typeof body.content === "string" && body.content.trim().length > 0;
          const validGen = typeof body.generated_at === "string" && Number.isFinite(Date.parse(body.generated_at));
          const validDate = typeof body.brief_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.brief_date);
          const validPtd = typeof body.previous_trading_day === "boolean";
          const cutoff = typeof body.source_checked_at === "string" && Number.isFinite(Date.parse(body.source_checked_at))
            ? body.source_checked_at
            : null;
          if (validType && validContent && validGen && validDate && validPtd) {
            setState({
              kind: "available",
              content: body.content,
              generatedAtEt: formatEt(body.generated_at),
              previousTradingDay: body.previous_trading_day,
              briefDateDisplay: formatBriefDate(body.brief_date),
              evidenceCutoff: cutoff,
            });
            return;
          }
          setState({ kind: "error", message: "Couldn't load the brief.", refreshable: true });
          return;
        }
        const reason: string = typeof body?.reason === "string" ? body.reason : "";
        switch (reason) {
          case "brief_not_ready":
            if (briefType === "am") {
              const next = resolveAmBriefNoticeAt(new Date());
              setState({
                kind: "notice",
                message: next.message,
                refreshable: next.refreshable,
                showAfterHoursCta: next.showAfterHoursCta,
              });
            } else {
              setState({ kind: "notice", message: "The PM brief has not been released.", refreshable: true });
            }
            return;
          case "pm_not_released":
            setState({ kind: "notice", message: "The PM brief has not been released.", refreshable: true });
            return;
          case "weekend_no_am_brief":
            if (briefType === "am") {
              const next = resolveAmBriefNoticeAt(new Date());
              setState({
                kind: "notice",
                message: next.message,
                refreshable: next.refreshable,
                showAfterHoursCta: next.showAfterHoursCta,
              });
            } else {
              setState({ kind: "notice", message: "No AM brief on weekends.", refreshable: false });
            }
            return;
          case "previous_report_unavailable":
            if (briefType === "am") {
              const next = resolveAmBriefNoticeAt(new Date());
              setState({
                kind: "notice",
                message: next.message,
                refreshable: next.refreshable,
                showAfterHoursCta: next.showAfterHoursCta,
              });
            } else {
              setState({ kind: "notice", message: "The previous Friday report is unavailable.", refreshable: false });
            }
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

  const amArchiveNotice =
    state.kind === "available" && briefType === "am"
      ? resolveAmBriefNoticeAt(new Date())
      : null;
  const showAmArchiveNotice =
    !!amArchiveNotice && !amArchiveNotice.refreshable && amArchiveNotice.showAfterHoursCta;

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
          <div className="space-y-3">
            {showAmArchiveNotice && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] text-foreground">
                <p className="whitespace-pre-line">{amArchiveNotice.message}</p>
                <Link to="/dashboard/after-hours" className="mt-1 inline-flex text-xs font-medium text-accent-blue hover:underline">
                  Go to After-Hours →
                </Link>
              </div>
            )}
            <AvailableBrief
              content={state.content}
              previousTradingDay={state.previousTradingDay}
              briefDateDisplay={state.briefDateDisplay}
              evidenceCutoff={state.evidenceCutoff}
              expanded={briefExpanded}
              onToggle={() => setBriefExpanded((v) => !v)}
            />
          </div>
        );
      case "notice":
      case "error":
        return (
          <div className="flex flex-col items-start gap-2">
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">{state.message}</p>
            {state.kind === "notice" && state.showAfterHoursCta && (
              <Link to="/dashboard/after-hours" className="text-xs font-medium text-accent-blue hover:underline">
                Go to After-Hours →
              </Link>
            )}
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

  const timestampText = state.kind === "available" && state.generatedAtEt
    ? `${timestampLabel} ${state.generatedAtEt}`
    : state.kind === "loading"
      ? "Updating..."
      : null;

  // isPro is presentation-only — no fetch gate, no blur overlay.
  void isPro;

  return (
    <div className="relative min-w-0 overflow-hidden rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold tracking-wide">{config.aiCardTitle}</h3>
        {timestampText && <span className="text-[11px] text-muted-foreground">{timestampText}</span>}
      </div>
      {renderBody()}
    </div>
  );
}

export function AvailableBrief({
  content,
  previousTradingDay,
  briefDateDisplay,
  evidenceCutoff,
  expanded,
  onToggle,
}: {
  content: string;
  previousTradingDay: boolean;
  briefDateDisplay: string | null;
  evidenceCutoff: string | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const summary = summarizeBrief(content, 2, 320);
  const canCollapse = content.trim().length > summary.trim().length + 8;
  const shown = expanded || !canCollapse ? content : summary;
  const cutoffLabel = evidenceCutoff ? etTimestampLabel(evidenceCutoff) : null;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {previousTradingDay && briefDateDisplay && (
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Last trading-day report · {briefDateDisplay}
        </div>
      )}
      {cutoffLabel && (
        <div data-testid="evidence-cutoff" className="text-[11px] text-muted-foreground">
          Evidence cutoff {cutoffLabel}
        </div>
      )}
      <div className="prose prose-sm dark:prose-invert max-w-none break-words text-sm leading-relaxed text-foreground/80 prose-headings:text-sm prose-headings:font-semibold prose-p:my-1">
        <ReactMarkdown>{shown}</ReactMarkdown>
      </div>
      {canCollapse && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse AI brief" : "Expand AI brief"}
          onClick={onToggle}
          className="min-h-8 self-start text-xs font-medium text-accent-blue hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
