import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TriggeredTimeCell } from "@/components/screener/TriggeredTimeCell";
import { scannerClockIsRunning } from "@/lib/screeners/scanner-clock";

const EVENT = "2026-09-25T22:01:22.000Z";
const NOW = new Date("2026-09-25T22:38:34.000Z");

describe("TriggeredTimeCell live age", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps the event time fixed while one shared clock advances the age", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const first = render(<TriggeredTimeCell triggeredAt={EVENT} />);
    const second = render(<TriggeredTimeCell triggeredAt={EVENT} />);
    expect(scannerClockIsRunning()).toBe(true);
    expect(screen.getAllByText("6:01:22 PM")).toHaveLength(2);
    expect(screen.getAllByText("09/25/26 ET")).toHaveLength(2);
    expect(screen.getAllByTestId("trigger-elapsed-age")[0]).toHaveTextContent("37m 12s ago");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(screen.getAllByText("6:01:22 PM")).toHaveLength(2);
    expect(screen.getAllByTestId("trigger-elapsed-age")[0]).toHaveTextContent("37m 13s ago");
    expect(screen.queryByText("6:01:23 PM")).not.toBeInTheDocument();

    first.unmount();
    expect(scannerClockIsRunning()).toBe(true);
    second.unmount();
    expect(scannerClockIsRunning()).toBe(false);
  });
});
