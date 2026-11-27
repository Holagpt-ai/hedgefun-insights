import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, type RenderResult } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AIBriefCard } from "@/components/dashboard/AIBriefCard";
import type { ComponentProps } from "react";

const authState = vi.hoisted(() => ({
  user: { id: "user-a" } as { id: string } | null,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: authState.user }),
}));

const briefHarness = vi.hoisted(() => {
  type SessionResult = { data: { session: { access_token: string; user: { id: string } } | null } };
  let getSessionImpl: () => Promise<SessionResult> = async () => ({
    data: { session: { access_token: "tok-a", user: { id: "user-a" } } },
  });
  let fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = async () =>
    new Response(JSON.stringify({ available: false, reason: "brief_not_ready", retryable: true }), {
      status: 200,
    });

  return {
    getSession: () => getSessionImpl(),
    fetch: (input: RequestInfo | URL, init?: RequestInit) => fetchImpl(input, init),
    setSession(impl: () => Promise<SessionResult>) {
      getSessionImpl = impl;
    },
    setFetch(impl: typeof fetchImpl) {
      fetchImpl = impl;
    },
    reset() {
      getSessionImpl = async () => ({
        data: { session: { access_token: "tok-a", user: { id: "user-a" } } },
      });
      fetchImpl = async () =>
        new Response(JSON.stringify({ available: false, reason: "brief_not_ready", retryable: true }), {
          status: 200,
        });
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => briefHarness.getSession(),
    },
  },
}));

const cardConfig = {
  aiCardTitle: "AI Pre-Market Brief",
  aiCardPlaceholderText: "Brief placeholder",
  upgradeCta: "Request Pro Access",
  aiCardGateHeading: "Pro required",
  aiCardGateBody: "Upgrade for the full brief.",
};

function renderBriefCard(props: ComponentProps<typeof AIBriefCard>): RenderResult {
  return render(
    <MemoryRouter>
      <AIBriefCard {...props} />
    </MemoryRouter>,
  );
}

function okBrief(content: string, briefType: "am" | "pm" = "am") {
  return new Response(
    JSON.stringify({
      available: true,
      brief_type: briefType,
      content,
      generated_at: "2026-11-27T13:00:00.000Z",
      brief_date: "2026-11-27",
      previous_trading_day: false,
      generation_window: "mid",
      expected_generation_window: "mid",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("AIBriefCard — authorized fetch lifecycle", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", briefHarness.fetch);
    briefHarness.reset();
    authState.user = { id: "user-a" };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("rejects 403 without rendering protected brief content", async () => {
    briefHarness.setFetch(async () => new Response("{}", { status: 403 }));
    renderBriefCard({ isPro: false, briefType: "am", config: cardConfig });
    await waitFor(() => {
      expect(screen.getByText("Request Pro Access")).toBeInTheDocument();
    });
    expect(screen.queryByText(/USER_SECRET_BRIEF/)).toBeNull();
  });

  it("ignores session user id mismatch", async () => {
    briefHarness.setSession(async () => ({
      data: { session: { access_token: "tok-a", user: { id: "user-other" } } },
    }));
    briefHarness.setFetch(async () => okBrief("MISMATCHED_USER_BRIEF"));
    renderBriefCard({ isPro: true, briefType: "am", config: cardConfig });
    await waitFor(() => {
      expect(screen.queryByText("MISMATCHED_USER_BRIEF")).toBeNull();
    });
  });

  it("does not let an obsolete response overwrite after account switch", async () => {
    let resolveSlow: (value: Response) => void;
    const slow = new Promise<Response>((resolve) => {
      resolveSlow = resolve;
    });
    briefHarness.setFetch(async () => slow);

    const view = renderBriefCard({ isPro: true, briefType: "am", config: cardConfig });

    authState.user = { id: "user-b" };
    briefHarness.setSession(async () => ({
      data: { session: { access_token: "tok-b", user: { id: "user-b" } } },
    }));
    briefHarness.setFetch(async () => okBrief("USER_B_BRIEF_TEXT"));
    view.rerender(
      <MemoryRouter>
        <AIBriefCard isPro briefType="am" config={cardConfig} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText(/USER_B_BRIEF_TEXT/)).toBeInTheDocument());

    await act(async () => {
      resolveSlow!(okBrief("USER_A_OBSOLETE_BRIEF"));
    });

    expect(screen.queryByText(/USER_A_OBSOLETE_BRIEF/)).toBeNull();
    expect(screen.getByText(/USER_B_BRIEF_TEXT/)).toBeInTheDocument();
  });

  it("discards superseded early AM cache when refetching in a later schedule window", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-11-27T09:20:00.000Z"));
    briefHarness.setFetch(async (_input, init) => {
      const raw = typeof init?.body === "string" ? init.body : "";
      const parsed = raw ? (JSON.parse(raw) as { briefType?: string }) : {};
      if (parsed.briefType === "pm") {
        return okBrief("PM_HANDOFF_BRIEF", "pm");
      }
      return new Response(
        JSON.stringify({
          available: true,
          brief_type: "am",
          content: "EARLY_SCHEDULE_BRIEF",
          generated_at: "2026-11-27T09:15:00.000Z",
          brief_date: "2026-11-27",
          previous_trading_day: false,
          generation_window: "early",
          expected_generation_window: "early",
        }),
        { status: 200 },
      );
    });

    const view = renderBriefCard({ isPro: true, briefType: "am", config: cardConfig });
    await waitFor(() => expect(screen.getByText(/EARLY_SCHEDULE_BRIEF/)).toBeInTheDocument());

    vi.setSystemTime(new Date("2026-11-27T12:40:00.000Z"));
    view.rerender(
      <MemoryRouter>
        <AIBriefCard isPro briefType="pm" config={{ ...cardConfig, aiCardTitle: "AI After-Hours Brief" }} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/PM_HANDOFF_BRIEF/)).toBeInTheDocument());

    briefHarness.setFetch(async () =>
      new Response(JSON.stringify({ available: false, reason: "brief_not_ready", retryable: true }), {
        status: 200,
      }),
    );
    view.rerender(
      <MemoryRouter>
        <AIBriefCard isPro briefType="am" config={cardConfig} />
      </MemoryRouter>,
    );

    await waitFor(
      () => {
        expect(screen.queryByText(/EARLY_SCHEDULE_BRIEF/)).toBeNull();
        expect(screen.getByTestId("brief-user-state")).toHaveTextContent("Generating");
      },
      { timeout: 8000 },
    );
  }, 15_000);

  it("does not cross-contaminate AM and PM brief scopes", async () => {
    briefHarness.setFetch(async (_input, init) => {
      const raw = typeof init?.body === "string" ? init.body : "";
      const parsed = raw ? (JSON.parse(raw) as { briefType?: string }) : {};
      const type = parsed.briefType === "pm" ? "pm" : "am";
      return okBrief(
        type === "pm" ? "PM_SCOPE_BRIEF" : "AM_SCOPE_BRIEF",
        type as "am" | "pm",
      );
    });
    const view = renderBriefCard({ isPro: true, briefType: "am", config: cardConfig });
    await waitFor(() => expect(screen.getByText(/AM_SCOPE_BRIEF/)).toBeInTheDocument());

    view.rerender(
      <MemoryRouter>
        <AIBriefCard
          isPro
          briefType="pm"
          config={{ ...cardConfig, aiCardTitle: "AI After-Hours Brief" }}
        />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/PM_SCOPE_BRIEF/)).toBeInTheDocument());
    expect(screen.queryByText(/AM_SCOPE_BRIEF/)).toBeNull();
  });
});