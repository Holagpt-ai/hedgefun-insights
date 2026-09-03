import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RadarStatusRail } from "../RadarStatusRail";
import type { RadarEngineSource } from "../types";

function renderRail(engineSource: RadarEngineSource) {
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
    />,
  );
}

describe("RadarStatusRail engine source honesty (D5.3)", () => {
  it("4. Radar V2 candidate source is not labeled a V2.1 snapshot", () => {
    renderRail("radar-v2-candidates");
    expect(screen.getByText("Radar V2 Sentinel")).toBeInTheDocument();
    expect(screen.queryByText("Radar V2.1 snapshot")).not.toBeInTheDocument();
    expect(screen.queryByText("Radar V2.2")).not.toBeInTheDocument();
  });

  it("5. Radar V2 PM rail does not render RTH-only criteria chips", () => {
    renderRail("radar-v2-candidates");
    expect(screen.queryByText("$2–$20 ENTRY")).not.toBeInTheDocument();
    expect(screen.queryByText("+10% CONFIRMED")).not.toBeInTheDocument();
    expect(screen.queryByText("CURRENT VOL ≥5× PRIOR")).not.toBeInTheDocument();
  });

  it("6. Radar V2 PM rail keeps truthful volume-first / delayed-feed wording", () => {
    renderRail("radar-v2-candidates");
    expect(screen.getByText("VOLUME FIRST")).toBeInTheDocument();
    expect(screen.getByText("15-MIN DELAYED")).toBeInTheDocument();
    expect(screen.getByText("SENTINEL DISCOVERY")).toBeInTheDocument();
    expect(screen.getByText("VELOCITY / ACCELERATION")).toBeInTheDocument();
    // The always-on delayed-feed disclosure remains present.
    expect(screen.getByText("Feed: 15-Minute Delayed")).toBeInTheDocument();
  });

  it("7. legacy v2.1 / v2.2 sources keep their existing RTH chips and labels", () => {
    const { unmount } = renderRail("v2.1");
    expect(screen.getByText("Radar V2.1 snapshot")).toBeInTheDocument();
    expect(screen.getByText("$2–$20 ENTRY")).toBeInTheDocument();
    expect(screen.getByText("+10% CONFIRMED")).toBeInTheDocument();
    expect(screen.getByText("CURRENT VOL ≥5× PRIOR")).toBeInTheDocument();
    expect(screen.queryByText("SENTINEL DISCOVERY")).not.toBeInTheDocument();
    unmount();

    renderRail("v2.2");
    expect(screen.getByText("Radar V2.2")).toBeInTheDocument();
    expect(screen.getByText("$2–$20 ENTRY")).toBeInTheDocument();
  });
});
