import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RadarStatusRail,
  engineChipsFor,
  engineLabelFor,
  formatHealthyRadarFeedLine,
  radarV2EngineChips,
  radarV2SessionChip,
} from "../RadarStatusRail";
import type { RadarEngineSource } from "../types";

function renderRail(
  engineSource: RadarEngineSource,
  session: string | null = "pre-market",
  status: "available" | "stale" | "unavailable" | "loading" | "empty" = "available",
) {
  return render(
    <RadarStatusRail
      status={status}
      qualifyingCount={128}
      syncedAt="2026-09-03T13:12:30.000Z"
      providerAsOfMax="2026-09-03T12:57:30.000Z"
      engineSource={engineSource}
      session={session}
    />,
  );
}

describe("RadarStatusRail condensed trader presentation", () => {
  it("keeps underlying Radar V2 session/state helpers without rendering engineering pills", () => {
    expect(radarV2SessionChip("pre-market")).toBe("PRE-MARKET");
    expect(radarV2SessionChip("market")).toBe("REGULAR MARKET");
    expect(radarV2SessionChip("after-hours")).toBe("AFTER-HOURS");
    expect(engineLabelFor("radar-v2-candidates")).toBe("Radar V2 Sentinel");
    expect(engineLabelFor("v2.1")).toBe("Radar V2.1 snapshot");
    expect(radarV2EngineChips("pre-market")).toContain("PRE-MARKET");
    expect(engineChipsFor("radar-v2-candidates", "market")).not.toContain("$2–$20 ENTRY");
    expect(engineChipsFor("v2.1")).toContain("$2–$20 ENTRY");
  });

  it("healthy status rail is condensed and feed-wide", () => {
    renderRail("radar-v2-candidates", "pre-market");
    expect(screen.getByTestId("market-data-status")).toBeInTheDocument();
    expect(screen.getByText("Data Status")).toBeInTheDocument();
    expect(screen.queryByText(/15-minute delayed/i)).not.toBeInTheDocument();
    expect(screen.getByText(/128 Radar candidates/)).toBeInTheDocument();
    expect(screen.queryByText("Radar V2 Sentinel")).not.toBeInTheDocument();
    expect(screen.queryByText("PRE-MARKET")).not.toBeInTheDocument();
    expect(screen.queryByText("$2–$20 ENTRY")).not.toBeInTheDocument();
    expect(screen.queryByText("VOLUME FIRST")).not.toBeInTheDocument();
  });

  it("does not imply timestamps change with a Trader Lens preset", () => {
    const a = formatHealthyRadarFeedLine("2026-09-03T12:57:30.000Z", "2026-09-03T13:12:30.000Z");
    const b = formatHealthyRadarFeedLine("2026-09-03T12:57:30.000Z", "2026-09-03T13:12:30.000Z");
    expect(a).toBe(b);
    expect(a).toMatch(/Market data status/i);
  });

  it("9. no RTH legacy criteria chips leak into Radar V2 UI", () => {
    for (const session of ["pre-market", "market", "after-hours"] as const) {
      const { unmount } = renderRail("radar-v2-candidates", session);
      expect(screen.queryByText("$2–$20 ENTRY")).not.toBeInTheDocument();
      expect(screen.queryByText("+10% CONFIRMED")).not.toBeInTheDocument();
      expect(screen.queryByText("CURRENT VOL ≥5× PRIOR")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("stale/unavailable remains visible", () => {
    const { unmount } = renderRail("radar-v2-candidates", "market", "stale");
    expect(screen.getByText("Feed stale")).toBeInTheDocument();
    expect(screen.getByTestId("radar-feed-line")).toBeInTheDocument();
    unmount();
    renderRail("v2.1", null, "unavailable");
    expect(screen.getByText("Data unavailable")).toBeInTheDocument();
  });

  it("legacy source also stays condensed in the healthy trader UI", () => {
    renderRail("v2.1", null);
    expect(screen.queryByText("Radar V2.1 snapshot")).not.toBeInTheDocument();
    expect(screen.queryByText("$2–$20 ENTRY")).not.toBeInTheDocument();
    expect(screen.getByTestId("radar-feed-line")).toBeInTheDocument();
  });
});
