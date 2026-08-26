import { useState, type ReactNode } from "react";
import {
  DEFAULT_REVEAL_LIMIT,
  revealToggleLabel,
  sliceForReveal,
} from "@/lib/session-intelligence/reveal";

interface TopNRevealProps<T> {
  items: readonly T[];
  limit?: number;
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
  children,
  className,
}: TopNRevealProps<T>) {
  const [expanded, setExpanded] = useState(false);
  const slice = sliceForReveal(items, expanded, limit);

  return (
    <div className={className}>
      {children(slice.visible)}
      {slice.canReveal && (
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
