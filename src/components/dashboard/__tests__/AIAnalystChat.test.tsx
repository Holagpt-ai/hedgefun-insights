import { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { AIAnalystChat } from "@/components/dashboard/AIAnalystChat";
import { ANALYST_WORKFLOWS } from "@/config/ai-analyst-presets.config";
import {
  streamChat,
  CHAT_REQUEST_TIMEOUT_MS,
  CHAT_REQUEST_TIMEOUT_ERROR,
} from "@/lib/chat";
import { toast } from "@/hooks/use-toast";

// ── Module boundaries stubbed so the tests exercise the analysis lifecycle only ──

vi.mock("@/lib/chat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chat")>();
  return {
    ...actual,
    streamChat: vi.fn(),
  };
});

vi.mock("react-markdown", () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

type AuthProfile = {
  full_name: string | null;
  plan: string | null;
  email: string | null;
  avatar_url: string | null;
  preferred_theme: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
};

function makeProfile(plan: string, fullName: string | null = "Ada Trader"): AuthProfile {
  return {
    full_name: fullName,
    plan,
    email: null,
    avatar_url: null,
    preferred_theme: null,
    subscription_status: null,
    current_period_end: null,
  };
}

let authValue: {
  user: { id: string } | null;
  loading: boolean;
  profile: AuthProfile | null;
} = {
  user: { id: "user-1" },
  loading: false,
  profile: makeProfile("pro"),
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authValue,
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
const toastMock = vi.mocked(toast);

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

/** Observes whether the handoff query is still present (not yet consumed). */
function SymbolParamProbe() {
  const [params] = useSearchParams();
  return <div data-testid="symbol-param">{params.get("symbol") ?? ""}</div>;
}

/**
 * Lets a test resolve entitlement after mount (profile null → plan known) while
 * keeping the same MemoryRouter entry so ?symbol= is not lost.
 */
function EntitlementHarness({
  userName = "Ada Trader",
  nextUrl = "/dashboard/ai?symbol=BBB",
}: {
  userName?: string;
  nextUrl?: string;
}) {
  const navigate = useNavigate();
  const [isPro, setIsPro] = useState(false);
  // Bumps even when isPro stays false so Free resolution re-renders after profile arrives.
  const [, setEntitlementEpoch] = useState(0);
  const plan = isPro ? "pro" : "free";
  return (
    <>
      <SymbolParamProbe />
      <button type="button" onClick={() => navigate(nextUrl)}>
        harness-navigate
      </button>
      <button
        type="button"
        onClick={() => {
          authValue = {
            user: { id: "user-1" },
            loading: false,
            profile: makeProfile("pro", userName),
          };
          setIsPro(true);
          setEntitlementEpoch((n) => n + 1);
        }}
      >
        resolve-entitlement-pro
      </button>
      <button
        type="button"
        onClick={() => {
          authValue = {
            user: { id: "user-1" },
            loading: false,
            profile: makeProfile("free", userName),
          };
          setIsPro(false);
          setEntitlementEpoch((n) => n + 1);
        }}
      >
        resolve-entitlement-free
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
  const resolvedPlan = plan ?? (isPro ? "pro" : "free");
  authValue = {
    user: { id: "user-1" },
    loading: false,
    profile: makeProfile(resolvedPlan, userName),
  };
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/dashboard/ai"
          element={
            <Harness
              isPro={isPro}
              plan={resolvedPlan}
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

function renderChatPendingEntitlement({
  url = "/dashboard/ai?symbol=AAA",
  userName = "Ada Trader",
}: {
  url?: string;
  userName?: string;
} = {}) {
  authValue = {
    user: { id: "user-1" },
    loading: false,
    profile: null,
  };
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/dashboard/ai"
          element={<EntitlementHarness userName={userName} />}
        />
        <Route path="/pro" element={<div>upgrade-route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const textarea = () =>
  screen.getByPlaceholderText(/ask about a setup/i) as HTMLTextAreaElement;

const workflowButton = (name: RegExp) => screen.getByRole("button", { name });

const analyzeButton = () => screen.getByRole("button", { name: /^analyze$/i });

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

async function attachFile(file = new File(["chart"], "chart.png", { type: "image/png" })) {
  fireEvent.change(fileInput(), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByText(file.name)).toBeInTheDocument());
  return file;
}

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
  toastMock.mockReset();
  sessionStorage.clear();
  authValue = {
    user: { id: "user-1" },
    loading: false,
    profile: makeProfile("pro"),
  };
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

  it("timeout clears the analyzing state when REQUEST_TIMEOUT is surfaced", async () => {
    streamChatMock.mockImplementation(async (args) => {
      args.onError?.(CHAT_REQUEST_TIMEOUT_ERROR);
    });

    renderChat();
    await typeAndSend("Hung analysis");
    await flush();

    expect(await screen.findByText(/analysis took too long/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeEnabled();
    expect(textarea()).not.toBeDisabled();
    expect(screen.queryByText(/analyzing available stocksist context/i)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/REQUEST_TIMEOUT/);
  });

  it("manual cancellation still works independently of timeout", async () => {
    let rejectStream: (reason: unknown) => void = () => {};
    streamChatMock.mockImplementation(
      () => new Promise((_resolve, reject) => { rejectStream = reject; }),
    );

    renderChat();
    await typeAndSend("Cancel me");
    await flush();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /new analysis/i }));
    });
    await act(async () => {
      rejectStream(abortError());
      await Promise.resolve();
    });

    expect(screen.queryByText(/took too long/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    expect(textarea()).not.toBeDisabled();
  });
});

describe("streamChat — client timeout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("aborts a never-settling request after CHAT_REQUEST_TIMEOUT_MS", async () => {
    const actual = await vi.importActual<typeof import("@/lib/chat")>("@/lib/chat");
    vi.useFakeTimers();

    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        signal.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const onError = vi.fn();
    const onDone = vi.fn();
    const pending = actual.streamChat({
      messages: [{ role: "user", content: "hi" }],
      sessionToken: "session",
      onDelta: () => {},
      onDone,
      onError,
    });

    await vi.advanceTimersByTimeAsync(CHAT_REQUEST_TIMEOUT_MS);
    await pending;

    expect(onError).toHaveBeenCalledWith(CHAT_REQUEST_TIMEOUT_ERROR);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("caller abort is not reported as REQUEST_TIMEOUT", async () => {
    const actual = await vi.importActual<typeof import("@/lib/chat")>("@/lib/chat");
    vi.useFakeTimers();

    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        signal.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const onError = vi.fn();
    const pending = actual.streamChat({
      messages: [{ role: "user", content: "hi" }],
      sessionToken: "session",
      signal: controller.signal,
      onDelta: () => {},
      onDone: () => {},
      onError,
    });

    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(onError).not.toHaveBeenCalledWith(CHAT_REQUEST_TIMEOUT_ERROR);
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

  it("does not consume the symbol or submit while entitlement is unresolved", async () => {
    streamChatMock.mockResolvedValue(undefined);

    renderChatPendingEntitlement({ url: "/dashboard/ai?symbol=XYZ" });
    await flush();

    expect(streamChatMock).not.toHaveBeenCalled();
    expect(textarea().value).toBe("");
    expect(screen.getByTestId("symbol-param")).toHaveTextContent("XYZ");
  });

  it("Pro handoff waits for entitlement resolution then submits exactly once", async () => {
    streamChatMock.mockResolvedValue(undefined);

    renderChatPendingEntitlement({ url: "/dashboard/ai?symbol=XYZ" });
    await flush();
    expect(streamChatMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("symbol-param")).toHaveTextContent("XYZ");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /resolve-entitlement-pro/i }));
    });
    await flush();

    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(1));
    const sent = streamChatMock.mock.calls[0][0] as StreamChatArgs;
    expect(sent.messages[sent.messages.length - 1].content).toContain("Analyze XYZ");
    expect(screen.getByTestId("symbol-param")).toHaveTextContent("");
  });

  it("Free handoff after entitlement resolution prefills without submitting", async () => {
    streamChatMock.mockResolvedValue(undefined);

    renderChatPendingEntitlement({ url: "/dashboard/ai?symbol=XYZ" });
    await flush();
    expect(streamChatMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("symbol-param")).toHaveTextContent("XYZ");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /resolve-entitlement-free/i }));
    });
    await flush();

    expect(textarea().value).toContain("Analyze XYZ");
    expect(streamChatMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("symbol-param")).toHaveTextContent("");
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

describe("AI Analyst — attachment submission", () => {
  it("enables Analyze for a valid attachment without auto-submitting", async () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat();

    expect(analyzeButton()).toBeDisabled();
    await attachFile();

    expect(analyzeButton()).toBeEnabled();
    expect(streamChatMock).not.toHaveBeenCalled();
  });

  it("submits an attachment exactly once with the selected workflow prompt", async () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat();
    const file = await attachFile();
    const quickScan = ANALYST_WORKFLOWS.find((workflow) => workflow.name === "Quick Scan")!;
    const expectedPrompt = quickScan.buildPrompt(null);

    await act(async () => {
      fireEvent.click(analyzeButton());
    });
    await flush();

    expect(streamChatMock).toHaveBeenCalledTimes(1);
    const sent = streamChatMock.mock.calls[0][0] as StreamChatArgs;
    expect(sent.messages[sent.messages.length - 1].content).toBe(expectedPrompt);
    expect(screen.getByText(expectedPrompt)).toBeInTheDocument();
    expect(sent.attachment).toMatchObject({
      type: "image",
      mediaType: file.type,
      fileName: file.name,
      data: expect.any(String),
    });
  });

  it("uses the existing Journal Review prompt for attachment-only analysis", async () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat();
    await act(async () => {
      fireEvent.click(workflowButton(/journal review/i));
    });
    fireEvent.change(textarea(), { target: { value: "" } });
    await attachFile(new File(["journal"], "journal.pdf", { type: "application/pdf" }));
    const journal = ANALYST_WORKFLOWS.find((workflow) => workflow.name === "Journal Review")!;

    await act(async () => {
      fireEvent.click(analyzeButton());
    });
    await flush();

    const sent = streamChatMock.mock.calls[0][0] as StreamChatArgs;
    expect(sent.messages[sent.messages.length - 1].content).toBe(journal.buildPrompt(null));
  });

  it("retains the active normalized ticker in the attachment fallback prompt", async () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat({ url: "/dashboard/ai?symbol=aaa", isPro: false });
    await flush();
    fireEvent.change(textarea(), { target: { value: "" } });
    await attachFile();
    const quickScan = ANALYST_WORKFLOWS.find((workflow) => workflow.name === "Quick Scan")!;

    await act(async () => {
      fireEvent.keyDown(textarea(), { key: "Enter", shiftKey: false });
    });
    await flush();

    expect(streamChatMock).toHaveBeenCalledTimes(1);
    const sent = streamChatMock.mock.calls[0][0] as StreamChatArgs;
    expect(sent.messages[sent.messages.length - 1].content).toBe(quickScan.buildPrompt("AAA"));
  });

  it("gives manually entered text precedence over the workflow fallback", async () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat();
    await attachFile();
    fireEvent.change(textarea(), { target: { value: "  Review only my stated setup  " } });

    await act(async () => {
      fireEvent.click(analyzeButton());
    });
    await flush();

    const sent = streamChatMock.mock.calls[0][0] as StreamChatArgs;
    expect(sent.messages[sent.messages.length - 1].content).toBe(
      "  Review only my stated setup  ",
    );
  });

  it("disables Analyze after the only attachment is removed", async () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat();
    await attachFile();
    expect(analyzeButton()).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /remove attachment/i }));

    expect(analyzeButton()).toBeDisabled();
    expect(streamChatMock).not.toHaveBeenCalled();
  });

  it("continues to reject invalid and oversized files", async () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat();
    const invalid = new File(["text"], "notes.txt", { type: "text/plain" });
    fireEvent.change(fileInput(), { target: { files: [invalid] } });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Unsupported file type", variant: "destructive" }),
    );
    expect(analyzeButton()).toBeDisabled();

    const oversized = new File(["x"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(oversized, "size", { value: 5 * 1024 * 1024 + 1 });
    fireEvent.change(fileInput(), { target: { files: [oversized] } });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "File too large", variant: "destructive" }),
    );
    expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
    expect(screen.queryByText("large.pdf")).not.toBeInTheDocument();
    expect(streamChatMock).not.toHaveBeenCalled();
  });

  it("preserves an attachment after failure and clears it on successful completion", async () => {
    streamChatMock.mockRejectedValueOnce(new Error("failed"));
    renderChat();
    await attachFile();

    await act(async () => {
      fireEvent.click(analyzeButton());
    });
    await flush();
    expect(screen.getByText("chart.png")).toBeInTheDocument();

    streamChatMock.mockImplementationOnce(async (args) => {
      args.onDone?.();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^retry$/i }));
    });
    await flush();

    expect(streamChatMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("chart.png")).not.toBeInTheDocument();
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

describe("AI Analyst — New Analysis reset", () => {
  it("fully resets approved workspace state without changing analysis depth", async () => {
    streamChatMock
      .mockImplementationOnce(async (args) => {
        args.onConversationId?.("conversation-1");
      })
      .mockRejectedValueOnce(new Error("failed"));
    renderChat({ url: "/dashboard/ai?symbol=aaa", isPro: true, plan: "pro" });
    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(1));

    fireEvent.click(
      screen.getByRole("button", { name: /standard — balanced trading analysis/i }),
    );
    fireEvent.click(workflowButton(/journal review/i));
    fireEvent.change(textarea(), { target: { value: "Review this journal entry" } });
    await attachFile(new File(["journal"], "journal.pdf", { type: "application/pdf" }));
    fireEvent.click(analyzeButton());
    await flush();
    expect(await screen.findByRole("button", { name: /^retry$/i })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^history$/i }));
      await Promise.resolve();
    });
    expect(screen.getByRole("dialog", { name: /analysis history/i })).toBeInTheDocument();
    const callsBeforeReset = streamChatMock.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: /^new analysis$/i }));

    expect(streamChatMock).toHaveBeenCalledTimes(callsBeforeReset);
    expect(screen.queryByRole("dialog", { name: /analysis history/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Ticker · AAA/)).not.toBeInTheDocument();
    expect(screen.queryByText("Review this journal entry")).not.toBeInTheDocument();
    expect(screen.queryByText("journal.pdf")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^retry$/i })).not.toBeInTheDocument();
    expect(textarea()).toHaveValue("");
    expect(textarea()).toHaveFocus();
    expect(workflowButton(/quick scan/i)).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /standard — balanced trading analysis/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(toastMock).toHaveBeenCalledWith({
      title: "New analysis ready",
      description: "Choose a workflow or enter your request.",
    });
  });

  it("focuses the textarea and confirms readiness from an already-clean workspace", () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat();

    fireEvent.click(screen.getByRole("button", { name: /^new analysis$/i }));

    expect(textarea()).toHaveFocus();
    expect(toastMock).toHaveBeenCalledWith({
      title: "New analysis ready",
      description: "Choose a workflow or enter your request.",
    });
    expect(streamChatMock).not.toHaveBeenCalled();
  });

  it("History Start new uses the same reset path and closes the drawer", async () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat();
    fireEvent.change(textarea(), { target: { value: "Unsaved request" } });
    await attachFile();
    fireEvent.click(workflowButton(/trade thesis/i));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^history$/i }));
      await Promise.resolve();
    });
    const dialog = screen.getByRole("dialog", { name: /analysis history/i });

    fireEvent.click(within(dialog).getByRole("button", { name: /^start new$/i }));

    expect(screen.queryByRole("dialog", { name: /analysis history/i })).not.toBeInTheDocument();
    expect(textarea()).toHaveValue("");
    expect(textarea()).toHaveFocus();
    expect(screen.queryByText("chart.png")).not.toBeInTheDocument();
    expect(workflowButton(/quick scan/i)).toHaveAttribute("aria-pressed", "true");
    expect(toastMock).toHaveBeenCalledWith({
      title: "New analysis ready",
      description: "Choose a workflow or enter your request.",
    });
    expect(streamChatMock).not.toHaveBeenCalled();
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
    /^chart$/i,
    /^action center$/i,
    /^stock journal$/i,
  ];

  it("shows the approved destinations under Related Tools including Chart", () => {
    streamChatMock.mockResolvedValue(undefined);
    renderChat();

    const relatedTools = screen.getByRole("navigation", { name: /related tools/i });
    const links = within(relatedTools).getAllByRole("link");
    expect(links).toHaveLength(6);
    expect(links.map((link) => link.textContent)).toEqual([
      "Screeners",
      "My Watchlist",
      "Catalyst",
      "Chart",
      "Action Center",
      "Stock Journal",
    ]);
    expect(within(relatedTools).queryByRole("button", { name: /new analysis/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new analysis/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^chart$/i })).toHaveAttribute("href", "/chart");
    expect(screen.getByRole("link", { name: /^my watchlist$/i })).toHaveAttribute(
      "href",
      "/dashboard/watchlist",
    );
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

  it("keeps Related Tools visible while analyzing, after success, and after failure", async () => {
    let finish: (() => void) | undefined;
    streamChatMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );

    renderChat();
    await typeAndSend("In flight");
    await flush();

    expect(screen.getByText(/analyzing available stocksist context/i)).toBeInTheDocument();
    for (const name of destinations) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }

    await act(async () => {
      finish?.();
      await Promise.resolve();
    });
    for (const name of destinations) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }

    streamChatMock.mockRejectedValueOnce(new Error("nope"));
    await typeAndSend("Then fail");
    await flush();
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    for (const name of destinations) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
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

  it("Chart and Watchlist keep the normalized active ticker once messages exist", async () => {
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
    expect(screen.getByRole("link", { name: /^my watchlist$/i })).toHaveAttribute(
      "href",
      "/dashboard/watchlist?symbol=AAA",
    );
    expect(screen.getByRole("link", { name: /^chart$/i })).toHaveAttribute(
      "href",
      "/chart/AAA",
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
