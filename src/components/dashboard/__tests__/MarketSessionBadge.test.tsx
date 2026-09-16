import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketSessionBadge } from "@/components/dashboard/MarketSessionBadge";
import { EXTENDED_SESSION_BADGE_POLL_MS } from "@/lib/extended-session-badge";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: { plan: "free" } }),
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "en", setLanguage: () => {}, t: (key: string) => key }),
}));

import DashboardSidebar from "@/components/dashboard/DashboardSidebar";

function renderSidebar(opts?: { collapsed?: boolean; forceExpanded?: boolean }) {
  window.localStorage.setItem(
    "dashboardSidebarCollapsed",
    opts?.collapsed ? "true" : "false",
  );
  return render(
    <MemoryRouter>
      <DashboardSidebar forceExpanded={opts?.forceExpanded ?? !opts?.collapsed} />
    </MemoryRouter>,
  );
}

describe("MarketSessionBadge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.removeItem("dashboardSidebarCollapsed");
  });

  it("12. automatically updates when the session changes", () => {
    vi.setSystemTime(new Date("2026-09-16T13:29:00Z")); // 9:29 AM ET
    render(<MarketSessionBadge />);
    expect(screen.getByText("PRE-MKT")).toBeInTheDocument();

    act(() => {
      vi.setSystemTime(new Date("2026-09-16T13:30:00Z")); // 9:30 AM ET
      vi.advanceTimersByTime(EXTENDED_SESSION_BADGE_POLL_MS);
    });
    expect(screen.queryByText("PRE-MKT")).not.toBeInTheDocument();

    act(() => {
      vi.setSystemTime(new Date("2026-09-16T20:00:00Z")); // 4:00 PM ET
      vi.advanceTimersByTime(EXTENDED_SESSION_BADGE_POLL_MS);
    });
    expect(screen.getByText("AFTER-HRS")).toBeInTheDocument();

    act(() => {
      vi.setSystemTime(new Date("2026-09-17T00:00:00Z")); // 8:00 PM ET
      vi.advanceTimersByTime(EXTENDED_SESSION_BADGE_POLL_MS);
    });
    expect(screen.queryByText("AFTER-HRS")).not.toBeInTheDocument();
  });

  it("13. reduced-motion disables the pulse animation", () => {
    vi.setSystemTime(new Date("2026-09-16T08:00:00Z")); // 4:00 AM ET
    render(<MarketSessionBadge />);
    const badge = screen.getByTestId("market-session-badge");
    expect(badge.className).toContain("motion-reduce:animate-none");
    expect(badge.className).toContain("motion-safe:animate-session-badge-breathe");
  });

  it("1-2. expanded Screeners row keeps the full label beside PRE-MKT", () => {
    vi.setSystemTime(new Date("2026-09-16T08:00:00Z")); // 4:00 AM ET
    renderSidebar();
    const label = screen.getByText("Screeners");
    expect(label.textContent).toBe("Screeners");
    expect(label.className).toMatch(/shrink-0/);
    expect(label.className).toMatch(/whitespace-nowrap/);
    expect(label.className).not.toMatch(/truncate/);
    const link = screen.getByRole("link", { name: /Screeners/ });
    expect(link.className).toMatch(/gap-2/);
    const badge = screen.getByTestId("market-session-badge");
    expect(badge.textContent).toBe("PRE-MKT");
    expect(badge.className).toMatch(/ml-auto/);
    expect(badge.className).toMatch(/shrink-0/);
    expect(badge.className).toMatch(/whitespace-nowrap/);
  });

  it("3. AFTER-HRS badge renders beside the full Screeners label", () => {
    vi.setSystemTime(new Date("2026-09-16T20:00:00Z"));
    renderSidebar();
    expect(screen.getByText("Screeners").textContent).toBe("Screeners");
    expect(screen.getByTestId("market-session-badge").textContent).toBe("AFTER-HRS");
    expect(screen.getByRole("link", { name: /Screeners/ })).toBeInTheDocument();
    expect(screen.queryByText("PRE-MKT")).not.toBeInTheDocument();
  });

  it("4. collapsed sidebar hides the session badge", () => {
    vi.setSystemTime(new Date("2026-09-16T08:00:00Z"));
    renderSidebar({ collapsed: true, forceExpanded: false });
    expect(screen.queryByTestId("market-session-badge")).not.toBeInTheDocument();
    expect(screen.queryByText("PRE-MKT")).not.toBeInTheDocument();
    expect(screen.queryByText("AFTER-HRS")).not.toBeInTheDocument();
  });
});
