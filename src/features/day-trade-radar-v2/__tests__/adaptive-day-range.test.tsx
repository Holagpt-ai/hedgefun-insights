import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdaptiveDayRangeBar, dayRangePositionPct } from "../AdaptiveDayRangeBar";

describe("adaptive day range position", () => {
  it("places the marker at the low, midpoint, and near high on each row's own scale", () => {
    expect(dayRangePositionPct(0.5, 0.5, 5)).toBe(0);
    expect(dayRangePositionPct(2.75, 0.5, 5)).toBe(50);
    expect(dayRangePositionPct(4.7, 2, 5)).toBe(90);
    expect(dayRangePositionPct(65, 50, 80)).toBe(50);
  });

  it("clamps outside the session range and treats a zero-width range as centered", () => {
    expect(dayRangePositionPct(0.1, 0.5, 5)).toBe(0);
    expect(dayRangePositionPct(9, 0.5, 5)).toBe(100);
    expect(dayRangePositionPct(5, 5, 5)).toBe(50);
  });

  it("returns null when price or range is missing", () => {
    expect(dayRangePositionPct(null, 0.5, 5)).toBeNull();
    expect(dayRangePositionPct(3, null, 5)).toBeNull();
    expect(dayRangePositionPct(3, 0.5, undefined)).toBeNull();
    expect(dayRangePositionPct(Number.NaN, 0.5, 5)).toBeNull();
  });
});

describe("AdaptiveDayRangeBar", () => {
  it("renders independent visual scales and a last-price marker", () => {
    const { rerender } = render(
      <AdaptiveDayRangeBar price={0.5} dayLow={0.5} dayHigh={5} hodDistancePercent={90} />,
    );
    expect(screen.getByTestId("adaptive-day-range")).toHaveAttribute("data-position", "0");
    expect(screen.getByTestId("range-last-marker")).toHaveStyle({ left: "0%" });
    expect(screen.getByText(/L \$0\.50/)).toBeInTheDocument();
    expect(screen.getByText(/\$5\.00 H/)).toBeInTheDocument();
    expect(screen.getByTestId("range-track")).toBeInTheDocument();
    expect(screen.getByTestId("range-low-cap")).toBeInTheDocument();
    expect(screen.getByTestId("range-high-cap")).toBeInTheDocument();
    expect(screen.getByText("90.0% from HOD")).toBeInTheDocument();
    expect(screen.queryByTestId("range-marker-vwap")).not.toBeInTheDocument();
    expect(screen.queryByTestId("range-marker-trigger")).not.toBeInTheDocument();

    rerender(
      <AdaptiveDayRangeBar price={65} dayLow={50} dayHigh={80} hodDistancePercent={18.8} />,
    );
    expect(screen.getByTestId("adaptive-day-range")).toHaveAttribute("data-position", "50");
    expect(screen.getByText(/L \$50\.00/)).toBeInTheDocument();
    expect(screen.getByText(/\$80\.00 H/)).toBeInTheDocument();
  });

  it("handles a zero-width range without dividing by zero", () => {
    render(<AdaptiveDayRangeBar price={8} dayLow={8} dayHigh={8} hodDistancePercent={0} />);
    expect(screen.getByTestId("adaptive-day-range")).toHaveAttribute("data-position", "50");
    expect(screen.getByTestId("range-last-marker")).toHaveStyle({ left: "50%" });
  });

  it("renders an honest unavailable state when price or range is missing", () => {
    render(<AdaptiveDayRangeBar price={null} dayLow={0.5} dayHigh={5} />);
    expect(screen.getByTestId("adaptive-day-range")).toHaveTextContent("Unavailable");
    expect(screen.queryByTestId("range-last-marker")).not.toBeInTheDocument();
  });
});
