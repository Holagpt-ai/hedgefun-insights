import { useMemo, useState } from "react";
import {
  EMPTY_SCREENER_FILTER_DRAFT,
  countActiveScreenerFilters,
  screenerFilterSetFromDraft,
  type ScreenerFilterDraft,
} from "@/lib/screeners/screener-filters";

export function useScreenerFilters() {
  const [draft, setDraft] = useState<ScreenerFilterDraft>(EMPTY_SCREENER_FILTER_DRAFT);
  const filterSet = useMemo(() => screenerFilterSetFromDraft(draft), [draft]);
  const activeCount = countActiveScreenerFilters(draft);

  const update = (key: keyof ScreenerFilterDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const clear = () => setDraft(EMPTY_SCREENER_FILTER_DRAFT);

  return {
    draft,
    setDraft,
    update,
    clear,
    filterSet,
    activeCount,
    hasActive: activeCount > 0,
  };
}
