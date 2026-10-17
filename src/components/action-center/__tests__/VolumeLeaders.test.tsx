import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { VolumeLeaders } from "../VolumeLeaders";
import type { ScreenerLeader } from "@/types/action-center";

const NOW = Date.parse("2026-03-15T18:00:00Z");

function leader(over: Partial<ScreenerLeader> & Pick<ScreenerLeader, "symbol">): ScreenerLeader {
  return {
    company_name: over.symbol,
    price: 10,
    change_percent: 5,
    volume: 1_000_000,
    rvol: 2,
    updated_at: "2026-03-15T17:59:00.000Z",
    ...over,
  };
}

describe("VolumeLeaders snapshot integrity", () => {
  it("renders mixed-age aggregate badge and per-row provenance", () => {
    render(
      <MemoryRouter>
      <VolumeLeaders
        nowMs={NOW}
        rows={[
          leader({
            symbol: "OLD",
            volume: 5_000_000,
            provider_as_of: "2026-03-14T20:00:00.000Z",
          }),
          leader({
            symbol: "NEW",
            volume: 1_000_000,
            provider_as_of: "2026-03-15T17:55:00.000Z",
          }),
        ]}
      />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("volume-leaders-list-badge")).toHaveTextContent("Mixed-age snapshots");
    expect(screen.getByTestId("volume-leader-row-snap-OLD")).toHaveTextContent(/Prior/i);
    expect(screen.getByTestId("volume-leader-row-snap-NEW").textContent).toMatch(/snap|Delayed/i);
  });

  it("preserves volume-desc row order from caller", () => {
    const { container } = render(
      <MemoryRouter>
        <VolumeLeaders
          nowMs={NOW}
          rows={[
            leader({ symbol: "AAA", volume: 3_000_000, provider_as_of: "2026-03-15T17:50:00.000Z" }),
            leader({ symbol: "BBB", volume: 2_000_000, provider_as_of: "2026-03-15T17:50:00.000Z" }),
          ]}
        />
      </MemoryRouter>,
    );
    const symbols = [...container.querySelectorAll("li .font-bold")].map((el) => el.textContent);
    expect(symbols).toEqual(["AAA", "BBB"]);
  });
});
