import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { AIAnalystChat } from "@/components/dashboard/AIAnalystChat";
import { ANALYST_WORKFLOWS } from "@/config/ai-analyst-presets.config";
import { streamChat } from "@/lib/chat";

// ── Module boundaries stubbed so the tests exercise the analysis lifecycle only ──

vi.mock("@/lib/chat", () => ({ streamChat: vi.fn() }));

vi.mock("react-markdown", () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "en" }),
}));

vi.mock("@/hooks/useVoiceInput", () => ({
  useVoiceInput: () => ({
    isSupported: false,
    isListening: false,
    error: null,
    startListening: vi.fn(),
    stopListening: vi.fn(),
  }),
}));

/** Chainable, awaitable stand-in for a PostgREST query builder. */
function queryStub() {
  const q: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit", "gte", "lte", "insert"]) {
    q[method] = () => q;
  }
  q.then = (resolve: (v: { data: never[] }) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve({ data: [] as never[] }).then(resolve, reject);
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => queryStub(),
    auth: {
      getSession: async () => ({ data: { session: { access_token: "test-token" } } }),
    },
  },
}));

type StreamChatArgs = Parameters<typeof streamChat>[0];
const streamChatMock = vi.mocked(streamChat);

/** Keeps the component mounted while the route query string changes. */
function Harness({
  isPro,
  plan,
  userName,
  nextUrl,
}: {
  isPro: boolean;
  plan: string;
  userName?: string;
  nextUrl: string;
}) {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate(nextUrl)}>
        harness-navigate
      </button>
      <AIAnalystChat isPro={isPro} userPlan={plan} userName={userName} />
    </>
  );
}

function renderChat({
  url = "/dashboard/ai",
  isPro = true,
  plan,
  userName = "Ada Trader",
  nextUrl = "/dashboard/ai?symbol=BBB",
}: {
  url?: string;
  isPro?: boolean;
  plan?: string;
  userName?: string;
  nextUrl?: string;
} = {}) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/dashboard/ai"
          element={
            <Harness
              isPro={isPro}
              plan={plan ?? (isPro ? "pro" : "free")}
              userName={userName}
              nextUrl={nextUrl}
            />
          }
        />
        {/* Provider-neutral upgrade destination, so gated clicks are observable. */}
        <Route path="/pro" element={<div>upgrade-route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const textarea = () =>
  screen.getByPlaceholderText(/ask about a setup/i) as HTMLTextAreaElement;

const workflowButton = (name: RegExp) => screen.getByRole("button", { name });

async function typeAndSend(text: string) {
  fireEvent.change(textarea(), { target: { value: text } });
  await act(async () => {
    fireEvent.keyDown(textarea(), { key: "Enter", shiftKey: false });
  });
}

/** Waits for the pending microtasks inside sendMessage (context + session) to settle. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function abortError() {
  const err = new Error("The operation was aborted.");
  err.name = "AbortError";
  return err;
}

beforeEach(() => {
  streamChatMock.mockReset();
  sessionStorage.clear();
  // jsdom implements neither of these; the component only uses them cosmetically.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  if (!("randomUUID" in globalThis.crypto)) {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      configurable: true,
      value: () => "00000000-0000-4000-8000-000000000000",
    });
  }
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AI Analyst — request lifecycle", () => {
  it("a rejected streamChat clears analyzing state and surfaces a retryable failure", async () => {
    streamChatMock.mockRejectedValue(
      new Error("FetchError: https://project.supabase.co/functions/v1/chat 500 sk-secret-token"),
    );

    renderChat();
    await typeAndSend("How does AAPL look?");
    await flush();

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeEnabled();

    // Analyzing state is fully released.
    expect(textarea()).not.toBeDisabled();
    expect(screen.queryByText(/analyzing available stocksist context/i)).not.toBeInTheDocument();

    // No transport detail leaks into the UI.
    expect(document.body.textContent).not.toMatch(/supabase\.co/);
    expect(document.body.textContent).not.toMatch(/sk-secret-token/);
    expect(document.body.textContent).not.toMatch(/FetchError/);
  });

  it("an intentional abort does not display a false failure", async () => {
    let rejectStream: (reason: unknown) => void = () => {};
    streamChatMock.mockImplementation(
      () => new Promise((_resolve, reject) => { rejectStream = reject; }),
    );

    renderChat();
    await typeAndSend("Analyze the open");
    await flush();

    // Cancel via "New Analysis", then let the aborted transport reject.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /new analysis/i }));
    });
    await act(async () => {
      rejectStream(abortError());
      await Promise.resolve();
    });

    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/analyzing available stocksist context/i)).not.toBeInTheDocument();
    expect(textarea()).not.toBeDisabled();
  });

  it("clears the rotating status interval when a request fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    streamChatMock.mockRejectedValue(new Error("boom"));

    renderChat();
    await typeAndSend("Check RVOL");
    await flush();

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it("does not report a failure when the component unmounts mid-request", async () => {
    let rejectStream: (reason: unknown) => void = () => {};
    streamChatMock.mockImplementation(
      () => new Promise((_resolve, reject) => { rejectStream = reject; }),
    );

    const { unmount } = renderChat();
    await typeAndSend("Analyze the close");
    await flush();

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    unmount();
    await act(async () => {
      rejectStream(abortError());
      await Promise.resolve();
    });
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("AI Analyst — ticker handoff", () => {
  it("a Pro ticker handoff submits exactly once", async () => {
    streamChatMock.mockResolvedValue(undefined);

    renderChat({ url: "/dashboard/ai?symbol=AAA", isPro: true });
    await flush();

    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(1));
    const sent = streamChatMock.mock.calls[0][0] as StreamChatArgs;
    expect(sent.messages[sent.messages.length - 1].content).toContain("Analyze AAA");
  });

  it("a Free ticker handoff prefills the normalized prompt without submitting", async () => {
    streamChatMock.mockResolvedValue(undefined);

    renderChat({ url: "/dashboard/ai?symbol=aaa", isPro: false });
    await flush();

    expect(textarea().value).toContain("Analyze AAA");
    expect(streamChatMock).not.toHaveBeenCalled();
  });

  it("an invalid symbol never produces an analysis request", async () => {
    streamChatMock.mockResolvedValue(undefined);

    renderChat({ url: "/dashboard/ai?symbol=%3Cscript%3E", isPro: true });
    await flush();

    expect(streamChatMock).not.toHaveBeenCalled();
    expect(textarea().value).toBe("");
  });

  it("still honours an existing ?prompt= handoff for Pro and Free", async () => {
    streamChatMock.mockResolvedValue(undefined);

    renderChat({ url: "/dashboard/ai?prompt=Show%20me%20gappers", isPro: true });
    await flush();
    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(1));
    const sent = streamChatMock.mock.calls[0][0] as StreamChatArgs;
    expect(sent.messages[sent.messages.length - 1].content).toBe("Show me gappers");

    cleanup();
    streamChatMock.mockClear();

    renderChat({ url: "/dashboard/ai?prompt=Show%20me%20gappers", isPro: false });
    await flush();
    expect(textarea().value).toBe("Show me gappers");
    expect(streamChatMock).not.toHaveBeenCalled();
  });

  it("processes a second valid ticker handoff without remounting", async () => {
    streamChatMock.mockResolvedValue(undefined);

    renderChat({ url: "/dashboard/ai?symbol=AAA", isPro: true });
    await flush();
    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /harness-navigate/i }));
    });
    await flush();

    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(2));
    const second = streamChatMock.mock.calls[1][0] as StreamChatArgs;
    expect(second.messages[second.messages.length - 1].content).toContain("Analyze BBB");
  });

  it("switching AAA → BBB clears the AAA conversation and keeps only BBB", async () => {
    const deltas: Array<(text: string) => void> = [];
    streamChatMock.mockImplementation((args) => {
      deltas.push(args.onDelta);
      return new Promise(() => {});
    });

    renderChat({ url: "/dashboard/ai?symbol=AAA", isPro: true });
    await flush();
    await waitFor(() => expect(deltas).toHaveLength(1));

    await act(async () => {
      deltas[0]("AAA is extending above VWAP.");
    });
    expect(screen.getByText(/AAA is extending above VWAP/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /harness-navigate/i }));
    });
    await flush();

    expect(screen.queryByText(/AAA is extending above VWAP/)).not.toBeInTheDocument();
    expect(screen.getByText(/Analyze BBB/)).toBeInTheDocument();
    expect(screen.getByText(/Ticker · BBB/)).toBeInTheDocument();

    // The superseded request also loses its conversation association.
    const second = streamChatMock.mock.calls[1][0] as StreamChatArgs;
    expect(second.conversationId).toBeUndefined();
    expect(second.messages).toHaveLength(1);
  });

  it("ignores late deltas from a superseded ticker", async () => {
    const deltas: Array<(text: string) => void> = [];
    streamChatMock.mockImplementation((args) => {
      deltas.push(args.onDelta);
      return new Promise(() => {});
    });

    renderChat({ url: "/dashboard/ai?symbol=AAA", isPro: true });
    await flush();
    await waitFor(() => expect(deltas).toHaveLength(1));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /harness-navigate/i }));
    });
    await flush();
    await waitFor(() => expect(deltas).toHaveLength(2));

    await act(async () => {
      deltas[0]("STALE AAA OUTPUT");
    });

    expect(screen.queryByText(/STALE AAA OUTPUT/)).not.toBeInTheDocument();
    expect(screen.getByText(/Ticker · BBB/)).toBeInTheDocument();
  });
});

describe("AI Analyst — trading workflows", () => {
  it("renders all six trading workflows", () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat();

    expect(ANALYST_WORKFLOWS).toHaveLength(6);
    for (const w of ANALYST_WORKFLOWS) {
      expect(screen.getByRole("button", { name: new RegExp(w.name, "i") })).toBeInTheDocument();
    }
    // Each option carries its compact "best for" description.
    expect(screen.getByText(/bull case, bear case, invalidation/i)).toBeInTheDocument();
  });

  it("selecting a workflow never submits an analysis", async () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat();

    for (const w of ANALYST_WORKFLOWS) {
      await act(async () => {
        fireEvent.click(workflowButton(new RegExp(w.name, "i")));
      });
    }
    await flush();

    expect(streamChatMock).not.toHaveBeenCalled();
  });

  it("a workflow prefills an empty composer and uses the active ticker", async () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat({ url: "/dashboard/ai?symbol=aaa", isPro: false });
    await flush();

    // Clear the handoff draft, then pick a workflow.
    fireEvent.change(textarea(), { target: { value: "" } });
    await act(async () => {
      fireEvent.click(workflowButton(/trade thesis/i));
    });

    expect(textarea().value).toMatch(/balanced trade thesis for AAA/i);
    expect(streamChatMock).not.toHaveBeenCalled();
  });

  it("falls back to a valid generic prompt when no ticker exists", async () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat({ isPro: false });

    await act(async () => {
      fireEvent.click(workflowButton(/risk check/i));
    });

    expect(textarea().value).toMatch(/the current market setup/i);
    expect(textarea().value).not.toMatch(/null|undefined/);
  });

  it("does not overwrite a manually edited prompt, but does replace an untouched draft", async () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat({ isPro: false });

    // Untouched generated draft is replaceable.
    await act(async () => {
      fireEvent.click(workflowButton(/quick scan/i));
    });
    const generated = textarea().value;
    expect(generated).toMatch(/rapid synthesis/i);

    await act(async () => {
      fireEvent.click(workflowButton(/catalyst review/i));
    });
    expect(textarea().value).not.toBe(generated);
    expect(textarea().value).toMatch(/verified catalyst context/i);

    // Manual edits are preserved.
    fireEvent.change(textarea(), { target: { value: "my own hand-written prompt" } });
    await act(async () => {
      fireEvent.click(workflowButton(/risk check/i));
    });

    expect(textarea().value).toBe("my own hand-written prompt");
    expect(screen.getByText(/your edited prompt was kept/i)).toBeInTheDocument();
    expect(streamChatMock).not.toHaveBeenCalled();
  });
});

describe("AI Analyst — simplified layout", () => {
  it("uses the supplied registered-user display name", () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat({ userName: "Maria Santos" });

    expect(screen.getByRole("heading", { name: "Hello, Maria" })).toBeInTheDocument();
    expect(screen.getByText(/what would you like to analyze today/i)).toBeInTheDocument();
  });

  it("does not hardcode a person's name", () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat({ userName: "Carlos Rivera" });

    expect(screen.getByRole("heading", { name: "Hello, Carlos" })).toBeInTheDocument();
    expect(screen.queryByText(/hello, ada/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/hello, maria/i)).not.toBeInTheDocument();
  });

  it("uses the neutral greeting fallback when no supported name exists", () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat({ userName: "" });

    expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();
    expect(screen.queryByText(/hello, trader/i)).not.toBeInTheDocument();
  });

  it("does not render the oversized command banner", () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat();

    expect(screen.queryByRole("heading", { name: /^ai analyst$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/^ready$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/research, validate, and pressure-test/i)).not.toBeInTheDocument();
  });

  it("keeps all six workflows rendered after conversation messages exist", async () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat();
    await typeAndSend("Keep the workflows visible");
    await flush();

    expect(screen.getByText(/keep the workflows visible/i)).toBeInTheDocument();
    for (const workflow of ANALYST_WORKFLOWS) {
      expect(
        screen.getByRole("button", { name: new RegExp(workflow.name, "i") }),
      ).toBeInTheDocument();
    }
  });

  it("has no workflow carousel controls", () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat();

    expect(screen.queryByRole("button", { name: /previous workflow/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next workflow/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show more/i })).not.toBeInTheDocument();
  });

  it("opens History as an overlay dialog without replacing the workspace", async () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat({ userName: "Ada Trader" });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^history$/i }));
    });

    expect(screen.getByRole("dialog", { name: /analysis history/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /hello, ada/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /quick scan/i })).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog", { name: /analysis history/i })).not.toBeInTheDocument();
  });
});

describe("AI Analyst — honest context and neutral positioning", () => {
  it("shows the active ticker only when a valid symbol exists", async () => {
    streamChatMock.mockResolvedValue(undefined);

    renderChat({ isPro: false });
    expect(screen.queryByText(/Ticker ·/)).not.toBeInTheDocument();

    cleanup();
    renderChat({ url: "/dashboard/ai?symbol=aaa", isPro: false });
    await flush();
    expect(screen.getByText(/Ticker · AAA/)).toBeInTheDocument();
  });

  it("does not fabricate context before a request proves it", async () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat({ isPro: false });

    // Nothing is claimed about dashboard data until a request returns.
    expect(screen.queryByText(/dashboard context attached/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no dashboard context returned/i)).not.toBeInTheDocument();

    // No fabricated freshness or source counts anywhere on the page.
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/\d+\s+sources?\b/i);
    expect(body).not.toMatch(/updated\s+\d/i);
    expect(body).not.toMatch(/\b\d+\s*(seconds?|minutes?)\s+ago\b/i);
  });

  it("reports context availability only from the completed request path", async () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat({ isPro: true });

    await typeAndSend("Check the tape");
    await flush();

    // Context is passed honestly to the request but no redundant ribbon is shown.
    expect(screen.queryByText(/dashboard context attached/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no dashboard context returned/i)).not.toBeInTheDocument();
    const sent = streamChatMock.mock.calls[0][0] as StreamChatArgs;
    expect(sent.systemContext).toBeUndefined();
  });

  it("shows the real access tier rather than a blanket Pro label", () => {
    streamChatMock.mockResolvedValue(undefined);

    renderChat({ isPro: false, plan: "free" });
    expect(screen.getByText(/free access/i)).toBeInTheDocument();
    expect(screen.queryByText(/pro access/i)).not.toBeInTheDocument();

    cleanup();
    renderChat({ isPro: true, plan: "unlimited" });
    expect(screen.getByText(/unlimited access/i)).toBeInTheDocument();
  });

  it("presents an admin entitlement as Unlimited Access", async () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat({ isPro: true, plan: "admin", userName: "Admin" });

    expect(screen.getByText(/^hello$/i)).toBeInTheDocument();
    expect(screen.getByText(/unlimited access/i)).toBeInTheDocument();
    expect(screen.queryByText(/admin access/i)).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /deep — highest-detail supported reasoning/i }));
    });
    await typeAndSend("Admin depth check");
    await flush();
    expect((streamChatMock.mock.calls[0][0] as StreamChatArgs).model).toBe("deep");
  });

  it("exposes no provider, vendor, or model branding", async () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat({ url: "/dashboard/ai?symbol=aaa", isPro: false });
    await flush();

    const surface = `${document.body.textContent ?? ""} ${textarea().value}`;
    for (const banned of [
      /claude/i,
      /anthropic/i,
      /qwen/i,
      /kimi/i,
      /perplexity/i,
      /openai/i,
      /\bgpt-?\d/i,
      /gemini/i,
      /llama/i,
      /powered by/i,
    ]) {
      expect(surface).not.toMatch(banned);
    }
    expect(screen.getAllByText(/stocksist intelligence/i).length).toBeGreaterThan(0);
  });
});

describe("AI Analyst — analysis depth", () => {
  it("keeps the existing tier identifiers behind the outcome-oriented labels", async () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat({ isPro: true, plan: "pro" });

    // Default depth maps to the existing "fast" tier.
    await typeAndSend("First question");
    await flush();
    expect((streamChatMock.mock.calls[0][0] as StreamChatArgs).model).toBe("fast");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /standard — balanced trading analysis/i }));
    });
    await typeAndSend("Second question");
    await flush();
    expect((streamChatMock.mock.calls[1][0] as StreamChatArgs).model).toBe("standard");
  });

  it("preserves entitlement gating for locked depths", async () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat({ isPro: false, plan: "free" });

    const standard = screen.getByRole("button", { name: /standard — balanced trading analysis/i });
    const deep = screen.getByRole("button", { name: /deep — highest-detail supported reasoning/i });
    expect(standard).toHaveAttribute("aria-pressed", "false");
    expect(deep).toHaveAttribute("aria-pressed", "false");

    // Only the free tier is selected, and it stays selected.
    expect(
      screen.getByRole("button", { name: /quick — rapid synthesis/i }),
    ).toHaveAttribute("aria-pressed", "true");

    // Gated depths route to the provider-neutral upgrade page instead of selecting.
    await act(async () => {
      fireEvent.click(standard);
    });
    expect(screen.getByText("upgrade-route")).toBeInTheDocument();
    expect(streamChatMock).not.toHaveBeenCalled();
  });

  it("unlocks every depth for an unlimited plan", async () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat({ isPro: true, plan: "unlimited" });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /deep — highest-detail supported reasoning/i }));
    });
    await typeAndSend("Deep question");
    await flush();

    expect((streamChatMock.mock.calls[0][0] as StreamChatArgs).model).toBe("deep");
  });
});

describe("AI Analyst — persistent workflow navigation", () => {
  const destinations = [
    /^screeners$/i,
    /^my watchlist$/i,
    /^catalyst$/i,
    /^action center$/i,
    /^stock journal$/i,
  ];

  it("shows exactly the five approved destinations under Related Tools", () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat();

    const relatedTools = screen.getByRole("navigation", { name: /related tools/i });
    const links = within(relatedTools).getAllByRole("link");
    expect(links).toHaveLength(5);
    expect(links.map((link) => link.textContent)).toEqual([
      "Screeners",
      "My Watchlist",
      "Catalyst",
      "Action Center",
      "Stock Journal",
    ]);
    expect(within(relatedTools).queryByRole("button", { name: /new analysis/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new analysis/i })).toBeInTheDocument();
  });

  it("keeps the workflow controls available before and after messages exist", async () => {
    streamChatMock.mockResolvedValue(undefined);

    renderChat();
    for (const name of destinations) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /new analysis/i })).toBeInTheDocument();

    await typeAndSend("Give me a plan");
    await flush();

    expect(screen.getByText(/give me a plan/i)).toBeInTheDocument();
    for (const name of destinations) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /new analysis/i })).toBeInTheDocument();
  });

  it("keeps the workflow controls available after a failure", async () => {
    streamChatMock.mockRejectedValue(new Error("nope"));

    renderChat();
    await typeAndSend("Give me a plan");
    await flush();

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    for (const name of destinations) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("Catalyst and Journal keep the normalized active ticker once messages exist", async () => {
    streamChatMock.mockResolvedValue(undefined);

    renderChat({ url: "/dashboard/ai?symbol=aaa", isPro: true });
    await flush();
    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(1));

    expect(screen.getByRole("link", { name: /^catalyst$/i })).toHaveAttribute(
      "href",
      "/dashboard/catalyst?symbol=AAA",
    );
    expect(screen.getByRole("link", { name: /^stock journal$/i })).toHaveAttribute(
      "href",
      "/dashboard/journal?symbol=AAA",
    );
    // Destinations that do not consume a ticker keep a bare route.
    expect(screen.getByRole("link", { name: /^my watchlist$/i })).toHaveAttribute(
      "href",
      "/dashboard/watchlist",
    );
    expect(screen.getByRole("link", { name: /^action center$/i })).toHaveAttribute(
      "href",
      "/dashboard/action-center",
    );
  });

  it("New Analysis clears the conversation, the ticker context, and the input", async () => {
    streamChatMock.mockResolvedValue(undefined);

    renderChat({ url: "/dashboard/ai?symbol=AAA", isPro: true });
    await flush();
    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Ticker · AAA/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /new analysis/i }));
    });

    expect(screen.queryByText(/Ticker · AAA/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Analyze AAA/)).not.toBeInTheDocument();
    expect(textarea().value).toBe("");
    expect(screen.getByRole("link", { name: /^catalyst$/i })).toHaveAttribute(
      "href",
      "/dashboard/catalyst",
    );
    // The workflow selection returns to the default too.
    expect(screen.getByRole("button", { name: /quick scan/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("AI Analyst — preserved entitlement outcomes", () => {
  it("still surfaces the daily-limit upgrade path", async () => {
    streamChatMock.mockImplementation(async (args) => {
      args.onError?.("DAILY_LIMIT_REACHED");
    });

    renderChat({ isPro: false });
    await typeAndSend("One more question");
    await flush();

    expect(await screen.findByText(/today's free AI message limit/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /request pro access/i })).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("still surfaces the signup prompt", async () => {
    streamChatMock.mockImplementation(async (args) => {
      args.onError?.("SIGNUP_PROMPT");
    });

    renderChat({ isPro: false });
    await typeAndSend("One more question");
    await flush();

    expect(
      await screen.findByText(/sign up for free to get more daily AI queries/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });
});
