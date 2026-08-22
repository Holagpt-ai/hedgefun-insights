import type { ReactNode } from "react";
import { AlertTriangle, Ban, Clock, Inbox, Loader2, MoonStar, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useJournalT } from "../i18n";

type HonestKind = "loading" | "empty" | "demo" | "partial" | "stale" | "error" | "comingSoon" | "excluded";

export function HonestState({
  kind,
  title,
  body,
  actions,
  onRetry,
}: {
  kind: HonestKind;
  title?: string;
  body?: string;
  actions?: ReactNode;
  onRetry?: () => void;
}) {
  const t = useJournalT();
  const icon = {
    loading: <Loader2 className="h-5 w-5 animate-spin text-accent-blue" />,
    empty: <Inbox className="h-5 w-5 text-muted-foreground" />,
    demo: <Sparkles className="h-5 w-5 text-accent-blue" />,
    partial: <AlertTriangle className="h-5 w-5 journal-warn" />,
    stale: <Clock className="h-5 w-5 journal-warn" />,
    error: <AlertTriangle className="h-5 w-5 journal-loss" />,
    comingSoon: <MoonStar className="h-5 w-5 text-muted-foreground" />,
    excluded: <Ban className="h-5 w-5 text-muted-foreground" />,
  }[kind];

  const resolvedTitle = title ?? (
    kind === "loading" ? t("state.loading")
      : kind === "empty" ? t("state.emptyTitle")
        : kind === "error" ? t("state.error")
          : kind === "comingSoon" ? t("state.comingSoon")
            : kind === "excluded" ? t("state.excluded")
              : kind === "partial" ? t("state.partial")
                : kind === "stale" ? t("state.stale")
                  : t("state.demoHint")
  );

  return (
    <div className="journal-card p-4 flex items-start gap-3">
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{resolvedTitle}</div>
        {body || kind === "empty" || kind === "comingSoon" ? (
          <p className="text-xs text-muted-foreground mt-1">
            {body ?? (kind === "empty" ? t("state.emptyBody") : kind === "comingSoon" ? t("state.comingSoonBody") : null)}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {actions}
          {kind === "error" && onRetry ? (
            <Button size="sm" variant="outline" onClick={onRetry}>{t("state.retry")}</Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
