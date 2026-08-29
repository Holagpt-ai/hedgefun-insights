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

  return (
    <div className={className}>
      {children(slice.visible)}
      {slice.canReveal && mode === "view-more" && (
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={
              expanded
                ? `Show less, ${slice.total} total`
                : `View ${slice.hiddenCount} more, ${slice.total} total`
            }
            onClick={() => setExpanded((v) => !v)}
            className="min-h-8 text-xs font-medium text-accent-blue hover:underline"
          >
            {revealMoreToggleLabel(expanded, slice.hiddenCount)}
          </button>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {slice.total} total
          </span>
        </div>
      )}
      {slice.canReveal && mode !== "view-more" && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-medium text-accent-blue hover:underline"
        >
          {revealToggleLabel(expanded, slice.total)}
        </button>
      )}
    </div>
  );
}
