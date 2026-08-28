/** Shared Market Movers layout contracts for 390px and desktop. */

export const MOVERS_MOBILE_VIEWPORT_PX = 390;
export const MOVERS_NARROW_VIEWPORT_PX = 360;
export const MOVERS_DESKTOP_VIEWPORT_PX = 1280;
export const MOVERS_OPTIONAL_COLUMN_BREAKPOINT_PX = 768;

export const MOVERS_PAGE_SHELL_CLASS = "w-full min-w-0 max-w-full";
export const MOVERS_PAGE_INNER_CLASS = "mx-auto min-w-0 max-w-7xl px-4 py-6";
export const MOVERS_TAB_BAR_CLASS = "flex min-w-0 items-center border-b border-border";
export const MOVERS_TABLIST_CLASS =
  "flex min-w-0 flex-1 items-center overflow-x-auto overscroll-x-contain";
export const MOVERS_TAB_BUTTON_CLASS =
  "relative shrink-0 whitespace-nowrap px-3 py-2.5 text-[0.9375rem] transition-colors sm:px-4";
export const MOVERS_FULL_WIDTH_CLASS =
  "hidden shrink-0 items-center gap-1.5 px-3 py-1.5 text-[0.875rem] sm:inline-flex";
export const MOVERS_TOOLBAR_CLASS = "flex min-w-0 flex-wrap items-center gap-2";
export const MOVERS_TABLE_SCROLLER_CLASS = "min-w-0 max-w-full overflow-x-auto";
export const MOVERS_TABLE_CLASS = "w-full table-fixed text-sm";
export const MOVERS_OPTIONAL_COLUMN_CLASS = "hidden md:table-cell";
export const MOVERS_NAME_TEXT_CLASS =
  "block min-w-0 truncate text-[0.875rem] text-foreground";
export const MOVERS_PAGINATION_CLASS =
  "flex flex-wrap items-center justify-between gap-2 border-t border-border py-4";
export const MOVERS_SPARKLINE_CHART_CLASS = "hidden h-[40px] w-[120px] shrink-0 md:block";
export const MOVERS_INDEX_CARD_CLASS =
  "relative flex min-w-0 items-center gap-2 rounded border border-border px-3 py-2 transition-colors duration-200 hover:border-primary/50";

export const MARKET_MOVERS_TAB_LABELS = [
  "Gainers",
  "Losers",
  "Active",
  "Premarket",
  "After Hours",
] as const;

export const MOVERS_COLUMN_MIN_PX = {
  symbol: 80,
  name: 160,
  price: 90,
  change: 90,
  changePercent: 90,
  volume: 110,
} as const;

export function isOptionalMoversColumn(columnId: string): boolean {
  return columnId === "name" || columnId === "change";
}

export function moversVisibleColumnMinWidth(viewportPx: number): number {
  const desktop = viewportPx >= MOVERS_OPTIONAL_COLUMN_BREAKPOINT_PX;
  const ids: Array<keyof typeof MOVERS_COLUMN_MIN_PX> = desktop
    ? ["symbol", "name", "price", "change", "changePercent", "volume"]
    : ["symbol", "price", "changePercent", "volume"];
  return ids.reduce((sum, id) => sum + MOVERS_COLUMN_MIN_PX[id], 0);
}

/** True when a box’s content is wider than its viewport. 1px slack for subpixels. */
export function hasHorizontalOverflow(
  scrollWidth: number,
  clientWidth: number,
  epsilon = 1,
): boolean {
  return scrollWidth - clientWidth > epsilon;
}

export function estimateNowrapTabsWidth(
  labels: readonly string[],
  paddingXPx: number,
  charPx: number,
): number {
  return labels.reduce((sum, label) => sum + paddingXPx * 2 + label.length * charPx, 0);
}

function classNameOf(el: Element): string {
  return typeof (el as HTMLElement).className === "string"
    ? (el as HTMLElement).className
    : "";
}

function isContainedHorizontalScroller(cls: string): boolean {
  return /\boverflow-x-auto\b/.test(cls) || /\boverflow-x-scroll\b/.test(cls);
}

function isHiddenBelowMdOrSm(cls: string): boolean {
  return /\bhidden\b/.test(cls) && (/\bsm:/.test(cls) || /\bmd:/.test(cls) || /\blg:/.test(cls));
}

/**
 * Estimate the min-content width that would expand the *page*, ignoring
 * descendants inside an explicit overflow-x scroller and mobile-hidden chrome.
 */
export function measureUncontainedMinWidth(root: HTMLElement): number {
  let max = 0;
  const visit = (el: HTMLElement, insideContainedScroller: boolean) => {
    const cls = classNameOf(el);
    if (isHiddenBelowMdOrSm(cls)) return;

    const contained = insideContainedScroller || isContainedHorizontalScroller(cls);
    if (!contained) {
      const minW = cls.match(/min-w-\[(\d+)px\]/);
      if (minW) max = Math.max(max, Number(minW[1]));
      const fixedW = cls.match(/(?:^|\s)w-\[(\d+)px\](?:\s|$)/);
      if (fixedW) max = Math.max(max, Number(fixedW[1]));
    }

    for (const child of el.children) {
      if (child instanceof HTMLElement) visit(child, contained);
    }
  };
  visit(root, false);
  return max;
}
