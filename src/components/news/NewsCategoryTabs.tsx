import { cn } from "@/lib/utils";
import { NEWS_CATEGORIES, type NewsCategoryValue } from "@/config/news-feed.config";

interface Props {
  value: NewsCategoryValue;
  onChange: (v: NewsCategoryValue) => void;
}

export default function NewsCategoryTabs({ value, onChange }: Props) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <div className="flex items-center gap-1.5 px-1 pb-1 min-w-max">
        {NEWS_CATEGORIES.map((c) => {
          const active = c.value === value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onChange(c.value)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap",
                active
                  ? "bg-accent-blue text-primary-foreground border-accent-blue"
                  : "bg-surface-card text-foreground border-border hover:bg-muted/60"
              )}
              aria-pressed={active}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
