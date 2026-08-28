import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MoversTable, type MoverRow } from "@/components/markets/MarketMoversLayout";
import { MarketMoversTabBar } from "@/components/markets/MarketMoversTabBar";
import {
  MARKET_MOVERS_TAB_LABELS,
  MOVERS_DESKTOP_VIEWPORT_PX,
  MOVERS_MOBILE_VIEWPORT_PX,
  MOVERS_NARROW_VIEWPORT_PX,
  MOVERS_OPTIONAL_COLUMN_CLASS,
  MOVERS_TABLE_SCROLLER_CLASS,
  estimateNowrapTabsWidth,
  hasHorizontalOverflow,
  measureUncontainedMinWidth,
  moversVisibleColumnMinWidth,
} from "@/components/markets/movers-responsive";

function row(overrides: Partial<MoverRow> & Pick<MoverRow, "symbol">): MoverRow {
  return {
    name: "International Business Machines Corporation",
    price: 185.42,
    change: 3.21,
    changePercent: 1.76,
    volume: 9_000_000,
    ...overrides,
  };
}

function renderMarketsAt(width: number) {
  return render(
    <MemoryRouter initialEntries={["/markets/gainers"]}>
      <div
        data-testid="page-viewport"
        className="min-w-0 max-w-full"
        style={{ width, maxWidth: width }}
      >
        <MarketMoversTabBar />
        <MoversTable
          sectionTitle="Top Gainers"
          rows={[
            row({ symbol: "IBM" }),
            row({ symbol: "AAPL", name: "Apple Inc.", price: 12.34, changePercent: 0.4, volume: 1_000_000 }),
          ]}
          isLoading={false}
        />
      </div>
    </MemoryRouter>,
  );
}

function headerCell(label: string): HTMLElement {
  const th = [...document.querySelectorAll("th")].find((el) => {
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    return text === label || text.startsWith(`${label} `);
  });
  expect(th).toBeTruthy();
  return th as HTMLElement;
}

describe("Market Movers horizontal overflow contracts", () => {
  it("treats scrollWidth greater than clientWidth as overflow", () => {
    expect(hasHorizontalOverflow(480, MOVERS_MOBILE_VIEWPORT_PX)).toBe(true);
    expect(hasHorizontalOverflow(MOVERS_MOBILE_VIEWPORT_PX, MOVERS_MOBILE_VIEWPORT_PX)).toBe(false);
    expect(hasHorizontalOverflow(391, MOVERS_MOBILE_VIEWPORT_PX)).toBe(false);
    expect(hasHorizontalOverflow(392, MOVERS_MOBILE_VIEWPORT_PX)).toBe(true);
  });

  it("proves the five tab labels exceed 390px when left unconstrained", () => {
    const unconstrained = estimateNowrapTabsWidth(MARKET_MOVERS_TAB_LABELS, 12, 8);
    expect(unconstrained).toBeGreaterThan(MOVERS_MOBILE_VIEWPORT_PX);
    expect(unconstrained).toBeGreaterThan(MOVERS_NARROW_VIEWPORT_PX);
    expect(hasHorizontalOverflow(unconstrained, MOVERS_MOBILE_VIEWPORT_PX)).toBe(true);
  });

  it("keeps mobile column mins inside 390px after hiding optional columns", () => {
    expect(moversVisibleColumnMinWidth(MOVERS_MOBILE_VIEWPORT_PX)).toBeLessThanOrEqual(
      MOVERS_MOBILE_VIEWPORT_PX,
    );
    expect(moversVisibleColumnMinWidth(MOVERS_NARROW_VIEWPORT_PX)).toBe(
      moversVisibleColumnMinWidth(MOVERS_MOBILE_VIEWPORT_PX),
    );
    expect(moversVisibleColumnMinWidth(MOVERS_DESKTOP_VIEWPORT_PX)).toBeGreaterThan(
      MOVERS_MOBILE_VIEWPORT_PX,
    );
  });

  it("does not count contained table min-width as page overflow", () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <div id="page" class="min-w-0 max-w-full">
        <div class="${MOVERS_TABLE_SCROLLER_CLASS}">
          <table class="min-w-[720px]"></table>
        </div>
      </div>
    `;
    const page = host.querySelector("#page") as HTMLElement;
    expect(measureUncontainedMinWidth(page)).toBeLessThanOrEqual(MOVERS_MOBILE_VIEWPORT_PX);
    expect(hasHorizontalOverflow(measureUncontainedMinWidth(page), MOVERS_MOBILE_VIEWPORT_PX)).toBe(
      false,
    );
  });

  it("does count an uncontained min-width as page overflow", () => {
    const host = document.createElement("div");
    host.innerHTML = `<div id="page"><table class="min-w-[480px]"></table></div>`;
    const page = host.querySelector("#page") as HTMLElement;
    expect(measureUncontainedMinWidth(page)).toBe(480);
    expect(hasHorizontalOverflow(measureUncontainedMinWidth(page), MOVERS_MOBILE_VIEWPORT_PX)).toBe(
      true,
    );
  });
});

describe.each([
  ["390px mobile", MOVERS_MOBILE_VIEWPORT_PX],
  ["360px narrow mobile", MOVERS_NARROW_VIEWPORT_PX],
  ["1280px desktop", MOVERS_DESKTOP_VIEWPORT_PX],
])("Market Movers chrome at %s", (_label, width) => {
  it("does not expand the page via uncontained min-width", () => {
    const { getByTestId } = renderMarketsAt(width);
    const page = getByTestId("page-viewport");
    const uncontained = measureUncontainedMinWidth(page);
    expect(uncontained).toBeLessThanOrEqual(width);
    expect(hasHorizontalOverflow(uncontained, width)).toBe(false);
    expect(page.className).not.toMatch(/overflow-x-hidden/);
    expect(document.body.className).not.toMatch(/overflow-x-hidden/);
  });

  it("keeps the ticker, price, percent, and volume usable", () => {
    const { getByTestId } = renderMarketsAt(width);
    const page = within(getByTestId("page-viewport"));
    expect(page.getByRole("button", { name: "IBM" })).toHaveClass("ticker-symbol");
    expect(headerCell("Symbol").className).toContain("whitespace-nowrap");
    expect(headerCell("Price")).toBeTruthy();
    expect(headerCell("% Change")).toBeTruthy();
    expect(headerCell("Volume")).toBeTruthy();
    expect(page.getByText("$185.42")).toBeTruthy();
    expect(page.getByText("+1.76%")).toBeTruthy();
    expect(page.getByText("9,000,000")).toBeTruthy();
  });
});

describe("Market Movers table containment at 390px", () => {
  it("isolates tab overflow to the tablist scroller", () => {
    renderMarketsAt(MOVERS_MOBILE_VIEWPORT_PX);
    const tablist = screen.getByRole("tablist", { name: "Market movers views" });
    expect(tablist.className).toMatch(/overflow-x-auto/);
    expect(tablist.className).toMatch(/min-w-0/);
    for (const label of MARKET_MOVERS_TAB_LABELS) {
      expect(screen.getByRole("tab", { name: label })).toBeTruthy();
    }
  });

  it("truncates long company names without hiding the ticker", () => {
    const { container } = renderMarketsAt(MOVERS_MOBILE_VIEWPORT_PX);
    expect(screen.getByRole("button", { name: "IBM" })).toBeTruthy();
    const name = container.querySelector("td .truncate");
    expect(name?.textContent).toBe("International Business Machines Corporation");
    expect(headerCell("Company Name").className).toContain(MOVERS_OPTIONAL_COLUMN_CLASS);
    expect(headerCell("Change").className).toContain(MOVERS_OPTIONAL_COLUMN_CLASS);
  });

  it("keeps table scrolling on the table region, not the page", () => {
    const { getByTestId, getByRole } = renderMarketsAt(MOVERS_MOBILE_VIEWPORT_PX);
    const scroller = getByRole("region", { name: "Top Gainers table" });
    expect(scroller.className).toMatch(/overflow-x-auto/);
    expect(scroller.className).toMatch(/min-w-0/);
    const page = getByTestId("page-viewport");
    expect(page.className).not.toMatch(/overflow-x-hidden/);
    expect(page.querySelector("table")?.className).not.toMatch(/min-w-\[/);
  });

  it("still exposes optional columns to desktop via md:table-cell", () => {
    renderMarketsAt(MOVERS_DESKTOP_VIEWPORT_PX);
    expect(headerCell("Company Name").className).toMatch(/md:table-cell/);
    expect(headerCell("Change").className).toMatch(/md:table-cell/);
    expect(headerCell("% Change").className).not.toMatch(/hidden/);
  });
});

describe("Shared movers routes keep the overflow-safe shell", () => {
  const marketsPages = [
    "src/pages/markets/GainersPage.tsx",
    "src/pages/markets/LosersPage.tsx",
    "src/pages/markets/ActivePage.tsx",
    "src/pages/markets/PremarketPage.tsx",
    "src/pages/markets/AfterHoursPage.tsx",
    "src/pages/movers/MoversPage.tsx",
  ];

  it("does not conceal overflow with page-level overflow-x-hidden", () => {
    for (const file of marketsPages) {
      const src = readFileSync(resolve(file), "utf8");
      expect(src).not.toMatch(/overflow-x-hidden/);
    }
    const layout = readFileSync(resolve("src/components/markets/MarketMoversLayout.tsx"), "utf8");
    const tabs = readFileSync(resolve("src/components/markets/MarketMoversTabBar.tsx"), "utf8");
    expect(layout).not.toMatch(/overflow-x-hidden/);
    expect(tabs).not.toMatch(/overflow-x-hidden/);
  });

  it("removes the 480px table min-width from /movers pages", () => {
    const src = readFileSync(resolve("src/pages/movers/MoversPage.tsx"), "utf8");
    expect(src).not.toContain("min-w-[480px]");
    expect(src).toContain("MOVERS_TABLE_SCROLLER_CLASS");
    expect(src).not.toContain("hidden sm:table-cell");
  });
});
