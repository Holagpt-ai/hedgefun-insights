import type { SortingState } from "@tanstack/react-table";

export type MoverTableKind = "gainers" | "losers" | "active";

export type MoversDefaultSort = {
  id: "changePercent" | "volume";
  desc: boolean;
};

/** Typed default sort for each movers table kind. Not route-path based. */
export function defaultSortForMoverKind(kind: MoverTableKind): MoversDefaultSort {
  if (kind === "active") return { id: "volume", desc: true };
  if (kind === "losers") return { id: "changePercent", desc: false };
  return { id: "changePercent", desc: true };
}

export function initialMoversSorting(
  defaultSort?: MoversDefaultSort,
  defaultSortDesc = true,
): SortingState {
  const sort = defaultSort ?? { id: "changePercent", desc: defaultSortDesc };
  if (sort.id === "volume") {
    return [
      { id: "volume", desc: sort.desc },
      { id: "symbol", desc: false },
    ];
  }
  return [{ id: sort.id, desc: sort.desc }];
}

export function volumeSortValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return Number.NEGATIVE_INFINITY;
  }
  return value;
}
