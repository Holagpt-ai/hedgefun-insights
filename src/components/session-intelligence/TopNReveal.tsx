import { useState, type ReactNode } from "react";
import {
  DEFAULT_REVEAL_LIMIT,
  revealMoreToggleLabel,
  revealToggleLabel,
  sliceForReveal,
} from "@/lib/session-intelligence/reveal";

interface TopNRevealProps<T> {
  items: readonly T[];
  limit?: number;
  /** `view-more` is Risk & Attention only. Other AM sections keep View All (total). */
  mode?: "view-all" | "view-more";
  children: (visible: T[]) => ReactNode;
  className?: string;
}

/**
 * Session-agnostic Top-N disclosure. Default shows `limit` items (3);
 * View All / Show Less exposes or collapses the remaining existing items.
 */
export function TopNReveal<T>({
  items,
  limit = DEFAULT_REVEAL_LIMIT,
  mode = "view-all",
  children,
  className,
}: TopNRevealProps<T>) {
  const [expanded, setExpanded] = useState(false);
  const slice = sliceForReveal(items, expanded, limit);
  const label = mode === "view-more"
    ? revealMoreToggleLabel(expanded, slice.hiddenCount)
    : revealToggleLabel(expanded, slice.total);

  return (
    <div className={className}>
      {children(slice.visible)}
      {slice.canReveal && (
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={
              mode === "view-more"
                ? expanded
                  ? `Show less, ${slice.total} total`
                  : `View ${slice.hiddenCount} more, ${slice.total} total`
                : undefined
            }
            onClick={() => setExpanded((v) => !v)}
            className={
              mode === "view-more"
                ? "min-h-8 text-xs font-medium text-accent-blue hover:underline"
                : "mt-0.5 text-xs font-medium text-accent-blue hover:underline"
            }
          >
            {label}
          </button>
          {mode === "view-more" && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {slice.total} total
            </span>
          )}
        </div>
      )}
    </div>
  );
}
