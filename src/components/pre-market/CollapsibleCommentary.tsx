import { useState } from "react";
import { stripMarkdownMarkers, summarizeBrief } from "@/lib/ai/evidence";

/** Accessible collapse for longer AI commentary. Does not delete the original text. */
export function CollapsibleCommentary({
  text,
  label = "AI commentary",
}: {
  text: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const cleaned = stripMarkdownMarkers(text);
  const summary = summarizeBrief(cleaned, 2, 280);
  const canCollapse = cleaned.trim().length > summary.trim().length + 8;
  const shown = open || !canCollapse ? cleaned : summary;

  return (
    <div className="min-w-0">
      <p className="break-words text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">{shown}</p>
      {canCollapse && (
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
          onClick={() => setOpen((v) => !v)}
          className="mt-1 min-h-8 text-[11px] font-medium text-accent-blue hover:underline"
        >
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
