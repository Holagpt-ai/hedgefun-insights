import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { AIAnalystChat } from "@/components/dashboard/AIAnalystChat";
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
function Harness({ isPro, nextUrl }: { isPro: boolean; nextUrl: string }) {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate(nextUrl)}>
        harness-navigate
      </button>
      <AIAnalystChat isPro={isPro} userPlan={isPro ? "pro" : "free"} userName="Ada Trader" />
    </>
  );
}

function renderChat({
  url = "/dashboard/ai",
  isPro = true,
  nextUrl = "/dashboard/ai?symbol=BBB",
}: { url?: string; isPro?: boolean; nextUrl?: string } = {}) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/dashboard/ai" element={<Harness isPro={isPro} nextUrl={nextUrl} />} />
      </Routes>
    </MemoryRouter>,
  );
}

const textarea = () =>
  screen.getByPlaceholderText(/ask about a setup/i) as HTMLTextAreaElement;

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
    expect(screen.queryByText(/analyzing dashboard context/i)).not.toBeInTheDocument();

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
    expect(screen.queryByText(/analyzing dashboard context/i)).not.toBeInTheDocument();
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
    expect(screen.getByText(/Ticker handoff: BBB/)).toBeInTheDocument();

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
    expect(screen.getByText(/Ticker handoff: BBB/)).toBeInTheDocument();
  });
});

describe("AI Analyst — persistent workflow navigation", () => {
  const destinations = [
    /back to screeners/i,
    /open watchlist/i,
    /view catalyst/i,
    /open action center/i,
    /log idea in journal/i,
  ];

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

    expect(screen.getByRole("link", { name: /view catalyst/i })).toHaveAttribute(
      "href",
      "/dashboard/catalyst?symbol=AAA",
    );
    expect(screen.getByRole("link", { name: /log idea in journal/i })).toHaveAttribute(
      "href",
      "/dashboard/journal?symbol=AAA",
    );
    // Destinations that do not consume a ticker keep a bare route.
    expect(screen.getByRole("link", { name: /open watchlist/i })).toHaveAttribute(
      "href",
      "/dashboard/watchlist",
    );
    expect(screen.getByRole("link", { name: /open action center/i })).toHaveAttribute(
      "href",
      "/dashboard/action-center",
    );
  });

  it("New Analysis clears the conversation, the ticker context, and the input", async () => {
    streamChatMock.mockResolvedValue(undefined);

    renderChat({ url: "/dashboard/ai?symbol=AAA", isPro: true });
    await flush();
    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Ticker handoff: AAA/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /new analysis/i }));
    });

    expect(screen.queryByText(/Ticker handoff: AAA/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Analyze AAA/)).not.toBeInTheDocument();
    expect(textarea().value).toBe("");
    expect(screen.getByRole("link", { name: /view catalyst/i })).toHaveAttribute(
      "href",
      "/dashboard/catalyst",
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
