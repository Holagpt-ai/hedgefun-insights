import { cleanup, render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VolumeTrendMark } from "../VolumeTrendMark";

function mark(accelerationPct: number | null) {
  cleanup();
  const view = render(<VolumeTrendMark accelerationPct={accelerationPct} />);
  return within(view.container).getByTitle(/Volume rate|Volume trend unavailable/);
}

describe("Volume Trend presentation", () => {
  it("colors upward states green and animates only the arrows", () => {
    const rising = mark(30);
    expect(rising).toHaveAttribute("data-volume-trend", "RISING ↑");
    expect(rising).toHaveAttribute("data-volume-motion", "up");
    expect(rising.className).toContain("text-green-600");
    expect(rising.querySelector("span.inline-block")?.className).toContain("motion-safe:animate-volume-trend-up");

    const extreme = mark(120);
    expect(extreme).toHaveAttribute("data-volume-trend", "EXTREME ↑↑");
    expect(extreme).toHaveAttribute("data-volume-motion", "up");
    expect(extreme.className).toContain("text-green-600");
  });

  it("colors cooling red and leaves steady neutral and still", () => {
    const cooling = mark(-25);
    expect(cooling).toHaveAttribute("data-volume-trend", "COOLING ↓");
    expect(cooling).toHaveAttribute("data-volume-motion", "down");
    expect(cooling.className).toContain("text-red-600");
    expect(cooling.querySelector("span.inline-block")?.className).toContain("motion-safe:animate-volume-trend-down");

    const steady = mark(0);
    expect(steady).toHaveAttribute("data-volume-trend", "STEADY");
    expect(steady).toHaveAttribute("data-volume-motion", "none");
    expect(steady.className).toContain("text-muted-foreground");
    expect(steady.querySelector("span.inline-block")).toBeNull();
    expect(steady.className).not.toContain("animate-volume-trend");
  });

  it("keeps closed-session color and drops the arrow motion", () => {
    cleanup();
    const view = render(<VolumeTrendMark accelerationPct={30} live={false} />);
    const rising = within(view.container).getByTitle(/Volume rate/);
    expect(rising).toHaveAttribute("data-volume-trend", "RISING ↑");
    expect(rising).toHaveAttribute("data-volume-motion", "none");
    expect(rising).toHaveAttribute("data-volume-context", "last-active");
    expect(rising.className).toContain("text-green-600");
    expect(rising.className).not.toContain("animate-volume-trend");
    expect(rising.textContent).toContain("Last active state");
  });
});
