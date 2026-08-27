import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  MoversTable,
  type MoverRow,
} from "@/components/markets/MarketMoversLayout";
import {
  defaultSortForMoverKind,
  initialMoversSorting,
} from "@/components/markets/movers-table-sort";
import type { ComponentProps } from "react";

function row(overrides: Partial<MoverRow> & Pick<MoverRow, "symbol">): MoverRow {
  return {
    name: overrides.symbol,
    price: 10,
    change: 1,
    changePercent: 5,
    volume: 1_000_000,
    ...overrides,
  };
}

function renderTable(
  rows: MoverRow[],
  props: Partial<ComponentProps<typeof MoversTable>> = {},
) {
  return render(
    <MemoryRouter>
      <MoversTable
        sectionTitle="Most Active Today"
        rows={rows}
        isLoading={false}
        {...props}
      />
    </MemoryRouter>,
  );
}

function visibleSymbols(): string[] {
  return screen.getAllByRole("button")
    .filter((el) => el.classList.contains("ticker-symbol"))
    .map((el) => el.textContent ?? "");
}

function headerCell(label: string): HTMLElement {
  const th = [...document.querySelectorAll("th")].find((el) => el.textContent?.includes(label));
  expect(th).toBeTruthy();
  return th as HTMLElement;
}

function headerText(label: string): string {
  return (headerCell(label).textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("defaultSortForMoverKind", () => {
  it("initializes Most Active with volume DESC", () => {
    expect(defaultSortForMoverKind("active")).toEqual({ id: "volume", desc: true });
    expect(initialMoversSorting(defaultSortForMoverKind("active"))).toEqual([
      { id: "volume", desc: true },
      { id: "symbol", desc: false },
    ]);
  });

  it("keeps Gainers on percentage-change descending", () => {
    expect(defaultSortForMoverKind("gainers")).toEqual({ id: "changePercent", desc: true });
  });

  it("keeps Losers on percentage-change ascending", () => {
    expect(defaultSortForMoverKind("losers")).toEqual({ id: "changePercent", desc: false });
  });

  it("uses the same initial sort on mobile and desktop", () => {
    const mobile = initialMoversSorting(defaultSortForMoverKind("active"));
    const desktop = initialMoversSorting(defaultSortForMoverKind("active"));
    expect(mobile).toEqual(desktop);
    expect(mobile[0]).toEqual({ id: "volume", desc: true });
  });
});

describe("Most Active visible table sort", () => {
  const mixed: MoverRow[] = [
    row({ symbol: "LOWV", volume: 100_000, changePercent: 40 }),
    row({ symbol: "HIV", volume: 9_000_000, changePercent: 1 }),
    row({ symbol: "MID", volume: 2_000_000, changePercent: 12 }),
  ];

  it("shows the Volume descending sort indicator", () => {
    renderTable(mixed, { defaultSort: defaultSortForMoverKind("active") });
    expect(headerText("Volume")).toContain("Volume");
    expect(headerText("Volume")).toContain("↓");
    expect(headerText("% Change")).not.toContain("↓");
  });

  it("orders larger valid volumes first", () => {
    renderTable(mixed, { defaultSort: defaultSortForMoverKind("active") });
    expect(visibleSymbols()).toEqual(["HIV", "MID", "LOWV"]);
  });

  it("places missing or unavailable volume below valid volume", () => {
    renderTable([
      row({ symbol: "MISS", volume: Number.NaN, changePercent: 90 }),
      row({ symbol: "ZERO", volume: 0, changePercent: 80 }),
      row({ symbol: "NEG", volume: -1, changePercent: 70 }),
      row({ symbol: "REAL", volume: 500_000, changePercent: 1 }),
    ], { defaultSort: defaultSortForMoverKind("active") });
    expect(visibleSymbols()).toEqual(["REAL", "ZERO", "MISS", "NEG"]);
  });

  it("breaks equal volumes deterministically by symbol", () => {
    renderTable([
      row({ symbol: "ZZZ", volume: 5_000_000, changePercent: 9 }),
      row({ symbol: "AAA", volume: 5_000_000, changePercent: 1 }),
      row({ symbol: "MMM", volume: 5_000_000, changePercent: 50 }),
    ], { defaultSort: defaultSortForMoverKind("active") });
    expect(visibleSymbols()).toEqual(["AAA", "MMM", "ZZZ"]);
  });

  it("still allows manual column sorting", () => {
    renderTable(mixed, { defaultSort: defaultSortForMoverKind("active") });
    expect(visibleSymbols()).toEqual(["HIV", "MID", "LOWV"]);
    fireEvent.click(headerCell("% Change"));
    expect(visibleSymbols()).toEqual(["LOWV", "MID", "HIV"]);
    fireEvent.click(headerCell("% Change"));
    expect(visibleSymbols()).toEqual(["HIV", "MID", "LOWV"]);
  });

  it("uses the same volume-first order at mobile and desktop widths", () => {
    const props = { defaultSort: defaultSortForMoverKind("active") };
    window.innerWidth = 375;
    const mobile = renderTable(mixed, props);
    expect(visibleSymbols()).toEqual(["HIV", "MID", "LOWV"]);
    expect(headerText("Volume")).toContain("↓");
    mobile.unmount();

    window.innerWidth = 1280;
    renderTable(mixed, props);
    expect(visibleSymbols()).toEqual(["HIV", "MID", "LOWV"]);
    expect(headerText("Volume")).toContain("↓");
  });
});

describe("Gainers and Losers retain percentage defaults", () => {
  const rows: MoverRow[] = [
    row({ symbol: "UP", changePercent: 20, volume: 100 }),
    row({ symbol: "FLAT", changePercent: 2, volume: 9_000_000 }),
    row({ symbol: "DOWN", changePercent: -15, volume: 50 }),
  ];

  it("keeps Gainers percentage-change descending", () => {
    renderTable(rows, { defaultSort: defaultSortForMoverKind("gainers"), colorMode: "green" });
    expect(visibleSymbols()).toEqual(["UP", "FLAT", "DOWN"]);
    expect(headerText("% Change")).toContain("↓");
  });

  it("keeps Losers percentage-change ascending", () => {
    renderTable(rows, { defaultSortDesc: false, colorMode: "red" });
    expect(visibleSymbols()).toEqual(["DOWN", "FLAT", "UP"]);
    expect(headerText("% Change")).toContain("↑");
  });
});

describe("Most Active page wiring and /movers/active", () => {
  it("wires /markets/active to the active mover default sort", () => {
    const src = readFileSync(resolve("src/pages/markets/ActivePage.tsx"), "utf8");
    expect(src).toContain('defaultSortForMoverKind("active")');
    expect(src).toContain('from "@/components/markets/movers-table-sort"');
    expect(src).toContain('sort: "volume_desc"');
  });

  it("leaves /movers/active volume-first and independent of MarketMoversLayout", () => {
    const src = readFileSync(resolve("src/pages/movers/MoversPage.tsx"), "utf8");
    expect(src).toContain('if (type === "active") return "volume_desc"');
    expect(src).not.toContain("MarketMoversLayout");
    expect(src).not.toContain("defaultSortForMoverKind");
  });
});
