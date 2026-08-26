import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WatchlistSessionCompact } from "@/components/pre-market/WatchlistActivityList";

describe("WatchlistSessionCompact", () => {
  it("shows the compact session copy and Open Watchlist action", () => {
    const onOpen = vi.fn();
    render(
      <WatchlistSessionCompact
        notice={{
          compact: true,
          headline: "Pre-market session has ended.",
          detail: "15 Watchlist symbols tracked.",
        }}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByText("Pre-market session has ended.")).toBeTruthy();
    expect(screen.getByText("15 Watchlist symbols tracked.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open Watchlist →" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
