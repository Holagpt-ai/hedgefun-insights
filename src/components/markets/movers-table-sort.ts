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

export function isValidMoverVolume(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Finite volume comparator for TanStack Table.
 * Always returns -1, 0, or 1. Never subtracts infinities.
 */
export function compareMoverVolume(a: unknown, b: unknown): number {
  const aValid = isValidMoverVolume(a);
  const bValid = isValidMoverVolume(b);
  if (!aValid && !bValid) return 0;
  if (!aValid) return -1;
  if (!bValid) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
