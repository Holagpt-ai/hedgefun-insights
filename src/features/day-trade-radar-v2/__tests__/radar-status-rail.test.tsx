import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RadarStatusRail } from "../RadarStatusRail";
import type { RadarEngineSource } from "../types";

function renderRail(engineSource: RadarEngineSource, session: string | null = "pre-market") {
  return render(
    <RadarStatusRail
      status="available"
      qualifyingCount={128}
      syncedAt="2026-09-03T13:12:30.000Z"
      providerAsOfMax="2026-09-03T12:57:30.000Z"
      followingLeader={false}
      onFollowLeader={() => {}}
      showReturnToLeader={false}
      onReturnToLeader={() => {}}
      engineSource={engineSource}
      session={session}
    />,
  );
}

describe("RadarStatusRail engine source honesty (D5.3 / D12)", () => {
  it("4. Radar V2 candidate source is not labeled a V2.1 snapshot", () => {
    renderRail("radar-v2-candidates", "pre-market");
    expect(screen.getByText("Radar V2 Sentinel")).toBeInTheDocument();
    expect(screen.queryByText("Radar V2.1 snapshot")).not.toBeInTheDocument();
    expect(screen.queryByText("Radar V2.2")).not.toBeInTheDocument();
  });

  it("5. PM Radar generation produces PRE-MARKET status rail", () => {
    renderRail("radar-v2-candidates", "pre-market");
    expect(screen.getByText("PRE-MARKET")).toBeInTheDocument();
    expect(screen.queryByText("REGULAR MARKET")).not.toBeInTheDocument();
    expect(screen.queryByText("AFTER-HOURS")).not.toBeInTheDocument();
  });

  it("6. market Radar generation produces REGULAR MARKET status rail", () => {
    renderRail("radar-v2-candidates", "market");
    expect(screen.getByText("REGULAR MARKET")).toBeInTheDocument();
    expect(screen.queryByText("PRE-MARKET")).not.toBeInTheDocument();
    expect(screen.queryByText("AFTER-HOURS")).not.toBeInTheDocument();
  });

  it("7. after-hours Radar generation produces AFTER-HOURS status rail", () => {
    renderRail("radar-v2-candidates", "after-hours");
    expect(screen.getByText("AFTER-HOURS")).toBeInTheDocument();
    expect(screen.queryByText("PRE-MARKET")).not.toBeInTheDocument();
    expect(screen.queryByText("REGULAR MARKET")).not.toBeInTheDocument();
  });

  it("8. no PM label leaks into RTH", () => {
    renderRail("radar-v2-candidates", "market");
    expect(screen.queryByText("PRE-MARKET")).not.toBeInTheDocument();
  });

  it("9. no RTH legacy criteria chips leak into Radar V2", () => {
    for (const session of ["pre-market", "market", "after-hours"] as const) {
      const { unmount } = renderRail("radar-v2-candidates", session);
      expect(screen.queryByText("$2–$20 ENTRY")).not.toBeInTheDocument();
      expect(screen.queryByText("+10% CONFIRMED")).not.toBeInTheDocument();
      expect(screen.queryByText("CURRENT VOL ≥5× PRIOR")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("10. no market label leaks into after-hours", () => {
    renderRail("radar-v2-candidates", "after-hours");
    expect(screen.queryByText("REGULAR MARKET")).not.toBeInTheDocument();
  });

  it("Radar V2 rail keeps truthful volume-first / delayed-feed wording", () => {
    renderRail("radar-v2-candidates", "after-hours");
    expect(screen.getByText("VOLUME FIRST")).toBeInTheDocument();
    expect(screen.getByText("15-MIN DELAYED")).toBeInTheDocument();
    expect(screen.getByText("SENTINEL DISCOVERY")).toBeInTheDocument();
    expect(screen.getByText("VELOCITY / ACCELERATION")).toBeInTheDocument();
    expect(screen.getByText("Feed: 15-Minute Delayed")).toBeInTheDocument();
  });

  it("legacy v2.1 / v2.2 sources keep their existing RTH chips and labels", () => {
    const { unmount } = renderRail("v2.1", null);
    expect(screen.getByText("Radar V2.1 snapshot")).toBeInTheDocument();
    expect(screen.getByText("$2–$20 ENTRY")).toBeInTheDocument();
    expect(screen.getByText("+10% CONFIRMED")).toBeInTheDocument();
    expect(screen.getByText("CURRENT VOL ≥5× PRIOR")).toBeInTheDocument();
    expect(screen.queryByText("SENTINEL DISCOVERY")).not.toBeInTheDocument();
    unmount();

    renderRail("v2.2", null);
    expect(screen.getByText("Radar V2.2")).toBeInTheDocument();
    expect(screen.getByText("$2–$20 ENTRY")).toBeInTheDocument();
  });
});
