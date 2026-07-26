import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import type { PreMarketChecklistItem } from "@/types/pre-market";

function storageKey(etDate: string) {
  return `stocksist:pre-market-checklist:${etDate}`;
}

function readState(etDate: string): Record<string, boolean> {
  try {
    const raw = sessionStorage.getItem(storageKey(etDate));
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function OpeningBellChecklist({
  items,
  etDate,
}: {
  items: PreMarketChecklistItem[];
  etDate: string;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setChecked(readState(etDate));
  }, [etDate]);

  const toggle = useCallback(
    (id: string, value: boolean) => {
      setChecked((prev) => {
        const next = { ...prev, [id]: value };
        try {
          sessionStorage.setItem(storageKey(etDate), JSON.stringify(next));
        } catch {
          /* local session state only */
        }
        return next;
      });
    },
    [etDate],
  );

  if (items.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4 text-xs text-muted-foreground">
        No checklist items generated from currently available data.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      {items.map((item) => (
        <div key={item.id} className="flex items-start gap-3 text-sm">
          <Checkbox
            id={`pm-check-${item.id}`}
            checked={!!checked[item.id]}
            onCheckedChange={(v) => toggle(item.id, !!v)}
            className="mt-0.5"
          />
          <label
            htmlFor={`pm-check-${item.id}`}
            className={`flex-1 cursor-pointer leading-snug ${checked[item.id] ? "text-muted-foreground line-through" : ""}`}
          >
            {item.label}
          </label>
          {item.route && (
            <Link to={item.route} className="shrink-0 text-xs text-accent-blue hover:underline">
              Open →
            </Link>
          )}
        </div>
      ))}
      <p className="mt-1 text-[11px] text-muted-foreground">
        Local session state only — checking an item does not change any market or account data.
      </p>
    </div>
  );
}
