import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import {
  Send,
  Loader2,
  Lock as LockIcon,
  Paperclip,
  X,
  MessageSquare,
  PlusCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Mic,
  AudioLines,
  Radar,
  Zap,
  Scale,
  CalendarClock,
  ShieldAlert,
  BookOpen,
  Microscope,
  Target,
  Terminal,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { streamChat, ChatMessage } from "@/lib/chat";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  ANALYST_WORKFLOWS,
  ANALYSIS_DEPTH_OPTIONS,
  ACCESS_TIER_LABELS,
  DEFAULT_ANALYST_WORKFLOW_ID,
  getAnalystWorkflow,
  type AnalystWorkflowIcon,
  type AnalystWorkflowId,
} from "@/config/ai-analyst-presets.config";
import { normalizeHandoffSymbol } from "@/lib/watchlist-v2/handoff";

// Only wording that the request path can actually stand behind.
const STREAMING_STATUS_MESSAGES = [
  "Analyzing available Stocksist context…",
  "Structuring your analysis…",
];

// Transport failures are surfaced as a single fixed sentence so no URL, header,
// token, response body, prompt, or provider detail can reach the screen.
const GENERIC_FAILURE_MESSAGE = "The analysis couldn't be completed. Please try again.";

const SIGNUP_PROMPT_MESSAGE = "Sign up for free to get more daily AI queries. No credit card required.";

const buildSymbolPrompt = (symbol: string) =>
  `Analyze ${symbol} as a day-trade setup. Focus on price action, RVOL, liquidity, catalyst risk, support/resistance, and what a disciplined trader should watch before entering. This is research only, not financial advice.`;

/** Distinguishes an intentional cancellation from a genuine failure. */
function isAbortLike(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: string }).name === "AbortError"
  );
}

const WORKFLOW_ICONS: Record<AnalystWorkflowIcon, typeof Zap> = {
  zap: Zap,
  scale: Scale,
  calendar: CalendarClock,
  shield: ShieldAlert,
  book: BookOpen,
  microscope: Microscope,
};

type ModelTier = "fast" | "standard" | "deep";

type Attachment = { type: "pdf" | "image"; data: string; mediaType: string; fileName: string };

type Conversation = {
  id: string;
  title: string;
  updated_at: string;
};

interface AIAnalystChatProps {
  isPro: boolean;
  userName?: string;
  userPlan: string;
}

/** Compact, provider-neutral context chip. */
function ContextChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
      {children}
    </span>
  );
}

export function AIAnalystChat({ isPro, userName, userPlan }: AIAnalystChatProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelTier>("fast");
  const [limitReached, setLimitReached] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [sessionToken] = useState(() => {
    const key = "hedgefun-analyst-session";
    let token = sessionStorage.getItem(key);
    if (!token) {
      token = crypto.randomUUID();
      sessionStorage.setItem(key, token);
    }
    return token;
  });
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const lastAttemptedPromptRef = useRef<string>("");
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const activeSymbolRef = useRef<string | null>(null);
  // Tracks the exact deep-link params already consumed. It resets as soon as the
  // URL is clean again, so a later ticker handoff is still processed.
  const handoffTokenRef = useRef<string | null>(null);
  // Mirror of `messages` so request payloads and stream updates never read a
  // stale render closure.
  const messagesRef = useRef<ChatMessage[]>([]);
  // Mirrors of the values a request payload depends on, so a request started in
  // the same tick as a reset cannot inherit the previous ticker's context.
  const conversationIdRef = useRef<string | null>(null);
  const attachmentRef = useRef<Attachment | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const unmountedRef = useRef(false);

  // Workflow selection is presentation only — it never submits an analysis.
  const [selectedWorkflowId, setSelectedWorkflowId] =
    useState<AnalystWorkflowId>(DEFAULT_ANALYST_WORKFLOW_ID);
  // The exact draft a workflow last wrote. Anything else in the composer is the
  // user's own text and must not be overwritten.
  const presetDraftRef = useRef<string>("");
  const [promptKept, setPromptKept] = useState(false);
  // null until a request proves whether dashboard context was actually returned.
  const [contextAttached, setContextAttached] = useState<boolean | null>(null);

  const commitMessages = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const applyConversationId = useCallback((id: string | null) => {
    conversationIdRef.current = id;
    setConversationId(id);
  }, []);

  const applyAttachment = useCallback((next: Attachment | null) => {
    attachmentRef.current = next;
    setAttachment(next);
  }, []);

  const clearStatusRotation = useCallback(() => {
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
  }, []);

  /**
   * Ends the active request: aborts the transport, bumps the request id so any
   * late callback is ignored, and returns the UI to a non-analyzing state.
   */
  const cancelActiveRequest = useCallback(() => {
    requestIdRef.current += 1;
    inFlightRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    clearStatusRotation();
    if (!unmountedRef.current) {
      setStreaming(false);
      setToolStatus(null);
    }
  }, [clearStatusRotation]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      requestIdRef.current += 1;
      inFlightRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
    };
  }, []);

  const setActiveWorkflowSymbol = useCallback((symbol: string | null) => {
    activeSymbolRef.current = symbol;
    setActiveSymbol(symbol);
  }, []);

  const { language } = useLanguage();
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const {
    isSupported: voiceSupported,
    isListening,
    error: voiceHookError,
    startListening,
    stopListening,
  } = useVoiceInput({
    language,
    onTranscript: (text) => setInput(text),
  });

  useEffect(() => {
    if (voiceHookError) {
      if (voiceHookError === "not-allowed") {
        setVoiceError(
          "Microphone access was denied. Please allow microphone access in your browser settings to use voice input."
        );
      } else {
        setVoiceError(
          "Voice input isn't working in this browser. For the most reliable results, use Chrome, Microsoft Edge, or Safari (14.1+ on Mac, 14.5+ on iOS). Some Chromium-based browsers like Opera or Brave may show the mic icon but fail to actually transcribe."
        );
      }
    }
  }, [voiceHookError]);

  const fetchConversations = async () => {
    if (!user?.id) return;
    setHistoryLoading(true);
    const { data } = await supabase
      .from("ai_conversations")
      .select("id, title, updated_at")
      .eq("user_id", user.id)
      .eq("surface", "analyst")
      .order("updated_at", { ascending: false })
      .limit(50);
    setConversations((data as Conversation[]) ?? []);
    setHistoryLoading(false);
  };

  const loadConversation = async (conv: Conversation) => {
    const { data } = await supabase
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });
    if (data) {
      cancelActiveRequest();
      commitMessages(
        data.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }))
      );
      applyConversationId(conv.id);
      setHistoryOpen(false);
    }
  };

  /** Cancels the active request and returns the page to a clean input state. */
  const startNewAnalysis = useCallback(() => {
    cancelActiveRequest();
    commitMessages([]);
    applyConversationId(null);
    setHistoryOpen(false);
    setActiveWorkflowSymbol(null);
    handoffTokenRef.current = null;
    lastAttemptedPromptRef.current = "";
    setInput("");
    applyAttachment(null);
    presetDraftRef.current = "";
    setPromptKept(false);
    setSelectedWorkflowId(DEFAULT_ANALYST_WORKFLOW_ID);
    setContextAttached(null);
  }, [
    cancelActiveRequest,
    commitMessages,
    applyConversationId,
    applyAttachment,
    setActiveWorkflowSymbol,
  ]);

  useEffect(() => {
    if (historyOpen) fetchConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyOpen, user?.id]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 5MB.", variant: "destructive" });
      return;
    }
    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");
    if (!isPdf && !isImage) {
      toast({ title: "Unsupported file type", description: "Only PDF and image files are supported.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      applyAttachment({
        type: isPdf ? "pdf" : "image",
        data: base64,
        mediaType: file.type,
        fileName: file.name,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const lastUserMsgRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const last = messages[messages.length - 1];
    const container = scrollContainerRef.current;
    const userMsg = lastUserMsgRef.current;
    if (last?.role === "user" && container && userMsg) {
      const cRect = container.getBoundingClientRect();
      const mRect = userMsg.getBoundingClientRect();
      container.scrollTop += mRect.top - cRect.top;
    }
  }, [messages]);

  // deep-link useEffect moved below sendMessage definition to avoid TDZ

  const canUseModel = (minPlan: string) => {
    if (minPlan === "free") return true;
    if (minPlan === "pro") return userPlan === "pro" || userPlan === "admin" || userPlan === "unlimited";
    if (minPlan === "unlimited") return userPlan === "unlimited" || userPlan === "admin";
    return false;
  };

  const fetchDashboardContext = useCallback(async (): Promise<string> => {
    try {
      const parts: string[] = [];

      // ── Market data (public — no auth required) ──────────────────────────
      const [gappersRes, radarRes, gainersRes, earningsRes] = await Promise.all([
        supabase
          .from("screener_results")
          .select("symbol, company_name, price, change_percent, gap_percent, volume")
          .eq("tab_id", "gappers")
          .order("gap_percent", { ascending: false })
          .limit(5),
        supabase
          .from("screener_results")
          .select("symbol, company_name, price, change_percent, rvol, volume")
          .eq("tab_id", "day_trade_radar")
          .order("rvol", { ascending: false })
          .limit(5),
        supabase
          .from("screener_results")
          .select("symbol, company_name, price, change_percent, volume")
          .eq("tab_id", "gainers_losers")
          .order("change_percent", { ascending: false })
          .limit(5),
        supabase
          .from("earnings_calendar")
          .select("symbol, company_name, report_date, time_of_day, estimate_eps, actual_eps, surprise_percent")
          .gte("report_date", new Date().toISOString().split("T")[0])
          .order("report_date", { ascending: true })
          .limit(8),
      ]);

      if (gappersRes.data && gappersRes.data.length > 0) {
        const lines = gappersRes.data.map((r: any) =>
          `${r.symbol} (${r.company_name ?? r.symbol}): price $${r.price?.toFixed(2) ?? "—"} gap ${r.gap_percent?.toFixed(1) ?? "—"}% vol ${r.volume ? (r.volume / 1_000_000).toFixed(1) + "M" : "—"}`
        );
        parts.push(`TODAY'S TOP GAPPERS (delayed screener data):\n${lines.join("\n")}`);
      }

      if (radarRes.data && radarRes.data.length > 0) {
        const lines = radarRes.data.map((r: any) =>
          `${r.symbol} (${r.company_name ?? r.symbol}): price $${r.price?.toFixed(2) ?? "—"} chg ${r.change_percent?.toFixed(1) ?? "—"}% RVOL ${r.rvol?.toFixed(1) ?? "—"}x vol ${r.volume ? (r.volume / 1_000_000).toFixed(1) + "M" : "—"}`
        );
        parts.push(`DAY TRADE RADAR (delayed screener data):\n${lines.join("\n")}`);
      }

      if (gainersRes.data && gainersRes.data.length > 0) {
        const lines = gainersRes.data.map((r: any) =>
          `${r.symbol} (${r.company_name ?? r.symbol}): price $${r.price?.toFixed(2) ?? "—"} chg ${r.change_percent?.toFixed(1) ?? "—"}%`
        );
        parts.push(`TOP GAINERS TODAY (delayed screener data):\n${lines.join("\n")}`);
      }

      if (earningsRes.data && earningsRes.data.length > 0) {
        const lines = earningsRes.data.map((r: any) => {
          const beat = r.surprise_percent != null
            ? ` surprise ${r.surprise_percent > 0 ? "+" : ""}${r.surprise_percent.toFixed(1)}%`
            : "";
          return `${r.symbol} (${r.company_name ?? r.symbol}): ${r.report_date} ${r.time_of_day ?? ""} est EPS ${r.estimate_eps ?? "—"} actual ${r.actual_eps ?? "TBD"}${beat}`;
        });
        parts.push(`UPCOMING EARNINGS:\n${lines.join("\n")}`);
      }

      // ── User-specific data (auth required) ───────────────────────────────
      if (user) {
        const [tradesRes, watchlistRes] = await Promise.all([
          supabase
            .from("journal_trades")
            .select("symbol, side, status, setup_tag, return_dollars, entry_date")
            .eq("user_id", user.id)
            .order("entry_date", { ascending: false })
            .limit(5),
          supabase
            .from("watchlists")
            .select("symbol")
            .eq("user_id", user.id)
            .limit(20),
        ]);

        if (tradesRes.data && tradesRes.data.length > 0) {
          const lines = tradesRes.data.map((t: any) =>
            `${t.symbol} ${t.side} ${t.status} setup:${t.setup_tag ?? "none"} pnl:${t.return_dollars ?? "open"}`
          );
          parts.push(`YOUR RECENT TRADES:\n${lines.join("\n")}`);
        }

        if (watchlistRes.data && watchlistRes.data.length > 0) {
          const symbols = watchlistRes.data.map((w: any) => w.symbol).join(", ");
          parts.push(`YOUR WATCHLIST: ${symbols}`);
        }

        // ── Catalyst context (RLS scoped; provider-reported only) ──────────
        try {
          const nowIso = new Date().toISOString();
          const in14 = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
          const from72h = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
          const today = new Date().toISOString().slice(0, 10);

          const [upcomingRes, recentRes] = await Promise.all([
            supabase
              .from("catalyst_events")
              .select("symbol, event_type, event_date, time_of_day, title")
              .eq("verification_state", "provider_reported")
              .gte("event_date", today)
              .lte("event_date", in14)
              .order("event_date", { ascending: true })
              .limit(10),
            supabase
              .from("catalyst_events")
              .select("symbol, event_type, published_at, title, source_name")
              .eq("verification_state", "provider_reported")
              .gte("published_at", from72h)
              .order("published_at", { ascending: false })
              .limit(10),
          ]);

          if (upcomingRes.data && upcomingRes.data.length > 0) {
            const lines = upcomingRes.data.map((r: any) =>
              `${r.symbol} [${r.event_type}]: ${r.event_date}${r.time_of_day ? ` ${r.time_of_day}` : ""} — ${r.title ?? ""}`.trim(),
            );
            parts.push(`UPCOMING CATALYSTS (next 14 days, provider-reported):\n${lines.join("\n")}`);
          }
          if (recentRes.data && recentRes.data.length > 0) {
            const lines = recentRes.data.map((r: any) =>
              `${r.symbol} [${r.event_type}]: ${r.title ?? ""} (source: ${r.source_name ?? "provider"})`.trim(),
            );
            parts.push(`RECENT CATALYSTS (last 72h, provider-reported):\n${lines.join("\n")}`);
          }
          if (upcomingRes.data?.length || recentRes.data?.length) {
            parts.push(`(Catalyst data snapshot at ${nowIso}. Provider-reported only.)`);
          }
        } catch {
          // Non-fatal: context is best-effort.
        }
      }


      return parts.join("\n\n");
    } catch {
      return "";
    }
  }, [user]);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || inFlightRef.current) return;

      const requestId = ++requestIdRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      inFlightRef.current = true;

      // A superseded or unmounted request may no longer write to the screen.
      const isCurrent = () => requestIdRef.current === requestId && !unmountedRef.current;

      commitMessages([...messagesRef.current, { role: "user", content: trimmed }]);
      setInput("");
      setPromptKept(false);
      presetDraftRef.current = "";
      setStreaming(true);
      lastAttemptedPromptRef.current = trimmed;

      // Rotate friendly status lines while we wait for the first delta
      let statusIdx = 0;
      clearStatusRotation();
      setToolStatus(STREAMING_STATUS_MESSAGES[0]);
      statusIntervalRef.current = setInterval(() => {
        if (!isCurrent()) return;
        statusIdx = (statusIdx + 1) % STREAMING_STATUS_MESSAGES.length;
        setToolStatus(STREAMING_STATUS_MESSAGES[statusIdx]);
      }, 2200);

      const appendAssistant = (text: string) => {
        if (!isCurrent()) return;
        commitMessages([...messagesRef.current, { role: "assistant", content: text }]);
      };

      try {
        const systemContext = await fetchDashboardContext();
        if (!isCurrent()) return;
        // Only ever reports what this request path actually produced.
        setContextAttached(systemContext.trim().length > 0);

        const { data: { session } } = await supabase.auth.getSession();
        if (!isCurrent()) return;

        let assistantContent = "";

        await streamChat({
          messages: messagesRef.current,
          sessionToken,
          accessToken: session?.access_token,
          model: selectedModel,
          attachment: attachmentRef.current ?? undefined,
          systemContext: systemContext || undefined,
          conversationId: conversationIdRef.current ?? undefined,
          signal: controller.signal,
          onConversationId: (id) => {
            if (!isCurrent()) return;
            applyConversationId(id);
          },
          onDelta: (delta) => {
            if (!isCurrent()) return;
            // First delta arrived — stop the rotating status
            clearStatusRotation();
            setToolStatus(null);
            assistantContent += delta;
            const prev = messagesRef.current;
            const last = prev[prev.length - 1];
            const bubble: ChatMessage = { role: "assistant", content: assistantContent };
            commitMessages(
              last?.role === "assistant" ? [...prev.slice(0, -1), bubble] : [...prev, bubble]
            );
          },
          onDone: () => {
            if (!isCurrent()) return;
            applyAttachment(null);
          },
          onError: (code) => {
            if (!isCurrent()) return;
            if (code === "DAILY_LIMIT_REACHED") {
              setLimitReached(true);
              return;
            }
            if (code === "SIGNUP_PROMPT") {
              appendAssistant(SIGNUP_PROMPT_MESSAGE);
              return;
            }
            appendAssistant(`Error: ${GENERIC_FAILURE_MESSAGE}`);
          },
        });
      } catch (err) {
        // An abort is an intentional cancellation, never a failure to report.
        if (!isAbortLike(err)) appendAssistant(`Error: ${GENERIC_FAILURE_MESSAGE}`);
      } finally {
        if (requestIdRef.current === requestId) {
          inFlightRef.current = false;
          abortRef.current = null;
          clearStatusRotation();
          if (!unmountedRef.current) {
            setStreaming(false);
            setToolStatus(null);
          }
        }
      }
    },
    [
      sessionToken,
      selectedModel,
      commitMessages,
      clearStatusRotation,
      fetchDashboardContext,
      applyConversationId,
      applyAttachment,
    ]
  );

  useEffect(() => {
    const rawSymbol = searchParams.get("symbol");
    const rawPrompt = searchParams.get("prompt");

    if (rawSymbol === null && rawPrompt === null) {
      // URL is clean again — the next handoff is a genuinely new one.
      handoffTokenRef.current = null;
      return;
    }

    // Guards against effect rerenders replaying the same handoff. It is not a
    // permanent latch: it is released above once the params are gone.
    const token = `s:${rawSymbol ?? ""}|p:${rawPrompt ?? ""}`;
    if (handoffTokenRef.current === token) return;
    handoffTokenRef.current = token;

    if (rawSymbol !== null) {
      const symbol = normalizeHandoffSymbol(rawSymbol);
      setSearchParams({}, { replace: true });
      // Invalid or empty symbols never produce an analysis request.
      if (!symbol) return;

      // A different ticker becomes a clean analysis context.
      if (activeSymbolRef.current && activeSymbolRef.current !== symbol) {
        cancelActiveRequest();
        commitMessages([]);
        applyConversationId(null);
        applyAttachment(null);
        lastAttemptedPromptRef.current = "";
        setContextAttached(null);
      }
      setActiveWorkflowSymbol(symbol);

      const synthesized = buildSymbolPrompt(symbol);

      if (isPro) {
        void sendMessage(synthesized);
        return;
      }
      // Free users: prefill and nudge — do not silently drop the handoff.
      setInput(synthesized);
      // Treated as a generated draft, so choosing a workflow may replace it.
      presetDraftRef.current = synthesized;
      setPromptKept(false);
      toast({
        title: `Ticker handoff: ${symbol}`,
        description: "Review and press send when you're ready.",
      });
      textareaRef.current?.focus();
      return;
    }

    let decoded = rawPrompt as string;
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      // Malformed encoding — fall back to the raw value.
    }
    setSearchParams({}, { replace: true });
    if (isPro) {
      void sendMessage(decoded);
      return;
    }
    // Free users: prefill and nudge — do not silently drop the prompt.
    setInput(decoded);
    presetDraftRef.current = decoded;
    setPromptKept(false);
    toast({
      title: "Prompt loaded",
      description: "Review and press send when you're ready.",
    });
    textareaRef.current?.focus();
  }, [
    isPro,
    searchParams,
    setSearchParams,
    sendMessage,
    cancelActiveRequest,
    commitMessages,
    applyConversationId,
    applyAttachment,
    setActiveWorkflowSymbol,
  ]);

  // Auto-scroll toward the bottom while the assistant streams
  useEffect(() => {
    if (!streaming) return;
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, streaming]);

  // Textarea auto-resize (up to max-height set on the element)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const retryLastPrompt = () => {
    const p = lastAttemptedPromptRef.current;
    if (!p || inFlightRef.current) return;
    let next = messagesRef.current;
    // Strip the trailing "Error: …" assistant message so retry replaces it
    const last = next[next.length - 1];
    if (last?.role === "assistant" && last.content.startsWith("Error:")) {
      next = next.slice(0, -1);
    }
    // Also strip the preceding user echo so sendMessage re-adds it cleanly
    const echo = next[next.length - 1];
    if (echo?.role === "user" && echo.content === p) {
      next = next.slice(0, -1);
    }
    commitMessages(next);
    void sendMessage(p);
  };

  /**
   * Selecting a workflow only ever prepares an editable draft. It replaces an
   * empty composer or an untouched generated draft, and otherwise keeps the
   * user's own text.
   */
  const selectWorkflow = (id: AnalystWorkflowId) => {
    setSelectedWorkflowId(id);
    const draft = getAnalystWorkflow(id).buildPrompt(activeSymbol);
    const isReplaceable = input.trim() === "" || input === presetDraftRef.current;
    if (isReplaceable) {
      presetDraftRef.current = draft;
      setInput(draft);
      setPromptKept(false);
      textareaRef.current?.focus();
      return;
    }
    setPromptKept(true);
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const displayName = userName?.split(" ")[0] ?? "Trader";

  const accessTierLabel = ACCESS_TIER_LABELS[(userPlan ?? "").trim().toLowerCase()] ?? "Free";
  const activeWorkflow = getAnalystWorkflow(selectedWorkflowId);
  const activeDepth =
    ANALYSIS_DEPTH_OPTIONS.find((d) => d.value === selectedModel) ?? ANALYSIS_DEPTH_OPTIONS[0];

  // Catalyst and Journal already consume `?symbol=`; the other destinations do not.
  const symbolQuery = activeSymbol ? `?symbol=${encodeURIComponent(activeSymbol)}` : "";
  const workflowLinks = [
    { label: "Back to Screeners", to: "/dashboard/screeners" },
    { label: "Open Watchlist", to: "/dashboard/watchlist" },
    { label: "View Catalyst", to: `/dashboard/catalyst${symbolQuery}` },
    { label: "Open Action Center", to: "/dashboard/action-center" },
    { label: "Log idea in Journal", to: `/dashboard/journal${symbolQuery}` },
  ];

  const composerDisabled = streaming || limitReached;

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      {/* History Sidebar — slide-over on mobile, static column on md+ */}
      {historyOpen && (
        <>
          <button
            type="button"
            aria-label="Close history overlay"
            onClick={() => setHistoryOpen(false)}
            className="md:hidden fixed inset-0 z-30 bg-black/40"
          />
          <aside
            className={cn(
              "flex flex-col bg-card border-r border-border",
              "fixed md:static inset-y-0 left-0 z-40 w-72 shadow-xl md:shadow-none",
              "md:shrink-0"
            )}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Analysis History</h2>
              <button
                onClick={() => setHistoryOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close history"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={startNewAnalysis}
              className="mx-3 mt-3 mb-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-accent-blue text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <PlusCircle className="h-4 w-4" />
              Start new
            </button>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {historyLoading ? (
                <p className="text-xs text-muted-foreground text-center py-4">Loading...</p>
              ) : conversations.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No conversations yet</p>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => loadConversation(conv)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg mb-1 text-sm transition-colors hover:bg-muted",
                      conversationId === conv.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{conv.title}</p>
                        <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(conv.updated_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>
        </>
      )}

      {/* Command center column. It scrolls as a whole on short viewports so the
          composer can never be clipped, while the working area scrolls on its own
          whenever there is room. */}
      <div className="flex h-full w-full min-w-0 max-w-5xl mx-auto flex-col overflow-y-auto overflow-x-hidden px-3 sm:px-5 py-3 sm:py-4">
        {/* ── A. Premium command header ─────────────────────────────────── */}
        <header className="relative shrink-0 overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-3 py-3 sm:px-5 sm:py-4">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-indigo-500/20 blur-3xl"
          />
          <div className="relative flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-500/15 ring-1 ring-inset ring-indigo-400/30">
                  <Radar className="h-4 w-4 text-indigo-300" />
                </span>
                <div className="min-w-0">
                  <h1 className="truncate text-base sm:text-xl font-semibold tracking-tight text-white">
                    AI Analyst
                  </h1>
                  <p className="truncate text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.16em] text-indigo-300/80">
                    Stocksist Intelligence
                  </p>
                </div>
              </div>
              <p className="mt-2 max-w-2xl text-xs sm:text-sm leading-relaxed text-slate-300">
                Research, validate, and pressure-test trading setups using available Stocksist
                market context.
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-1 text-[11px] font-medium text-slate-200 ring-1 ring-inset ring-white/10">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    streaming ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
                  )}
                />
                {streaming ? "Analyzing" : "Ready"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-200 ring-1 ring-inset ring-indigo-400/25">
                {accessTierLabel} access
              </span>
            </div>
          </div>
        </header>

        {/* ── B. Honest context ribbon ──────────────────────────────────── */}
        <div className="mt-2 flex shrink-0 flex-wrap items-center gap-1.5">
          {activeSymbol && (
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-accent-blue/40 bg-accent-blue/10 px-2 py-1 text-[11px] font-semibold text-accent-blue">
              <Target className="h-3 w-3 shrink-0" />
              <span className="truncate">Ticker · {activeSymbol}</span>
            </span>
          )}
          <ContextChip>Workflow · {activeWorkflow.name}</ContextChip>
          <ContextChip>Depth · {activeDepth.label}</ContextChip>
          <ContextChip>Access · {accessTierLabel}</ContextChip>
          {contextAttached === true && <ContextChip>Dashboard context attached</ContextChip>}
          {contextAttached === false && <ContextChip>No dashboard context returned</ContextChip>}
          <span className="text-[10px] leading-tight text-muted-foreground">
            Coverage varies by symbol and session.
          </span>
        </div>

        {/* History toggle */}
        <div className="mt-2 flex shrink-0 items-center justify-between">
          <button
            type="button"
            onClick={() => setHistoryOpen(!historyOpen)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {historyOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <MessageSquare className="h-3.5 w-3.5" />
            History
          </button>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            {greeting}, {displayName}.
          </span>
        </div>

        {/* ── Scrollable working area ───────────────────────────────────── */}
        <div
          ref={scrollContainerRef}
          className="mt-2 min-h-[10rem] flex-1 overflow-y-auto overflow-x-hidden -mx-1 px-1"
        >
          {messages.length === 0 ? (
            <div className="pb-2">
              {/* C. Trading-intent workflow selector */}
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Choose a trading workflow
              </h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ANALYST_WORKFLOWS.map((w) => {
                  const Icon = WORKFLOW_ICONS[w.icon];
                  const selected = w.id === selectedWorkflowId;
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => selectWorkflow(w.id)}
                      aria-pressed={selected}
                      className={cn(
                        "group flex min-w-0 items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors duration-200",
                        selected
                          ? "border-accent-blue/60 bg-accent-blue/10"
                          : "border-border bg-card hover:bg-muted/50"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md ring-1 ring-inset transition-colors",
                          selected
                            ? "bg-accent-blue/15 text-accent-blue ring-accent-blue/30"
                            : "bg-muted/60 text-muted-foreground ring-border"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {w.name}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                          {w.bestFor}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Selecting a workflow prepares an editable prompt. Nothing is sent until you
                analyze.
              </p>

              {toolStatus && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {toolStatus}
                </div>
              )}
            </div>
          ) : (
            /* ── G. Premium conversation workspace ────────────────────── */
            <div className="space-y-3 pb-2">
              {messages.map((msg, i) => {
                const isErrorMsg =
                  msg.role === "assistant" && msg.content.startsWith("Error:");
                if (isErrorMsg) {
                  return (
                    <div key={i} className="scroll-mt-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
                      <p className="mb-1 text-sm font-medium text-foreground">Something went wrong</p>
                      <p className="mb-2 break-words text-xs text-muted-foreground">
                        {msg.content.replace(/^Error:\s*/, "")}
                      </p>
                      {lastAttemptedPromptRef.current && (
                        <button
                          type="button"
                          onClick={retryLastPrompt}
                          disabled={streaming}
                          className="inline-flex items-center gap-1.5 rounded-md bg-accent-blue px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  );
                }

                if (msg.role === "user") {
                  return (
                    <div
                      key={i}
                      ref={i === messages.length - 1 ? lastUserMsgRef : undefined}
                      className="flex scroll-mt-2 justify-end"
                    >
                      <div className="max-w-[85%] min-w-0 whitespace-pre-wrap break-words rounded-lg rounded-br-sm bg-accent-blue px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
                        {msg.content}
                      </div>
                    </div>
                  );
                }

                return (
                  <article
                    key={i}
                    className="scroll-mt-2 overflow-hidden rounded-lg border border-border bg-card"
                  >
                    <div className="flex items-center gap-1.5 border-b border-border/70 bg-muted/30 px-3 py-1.5">
                      <Terminal className="h-3 w-3 text-accent-blue" />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Analyst Response
                      </span>
                    </div>
                    <div className="min-w-0 px-3 py-3 sm:px-4">
                      {msg.content ? (
                        <div
                          className="prose prose-sm max-w-none overflow-x-auto break-words text-foreground
                            prose-headings:text-foreground prose-headings:font-semibold prose-headings:tracking-tight
                            prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
                            prose-strong:text-foreground prose-strong:font-semibold
                            prose-p:my-1.5 prose-p:leading-relaxed prose-headings:mt-3 prose-headings:mb-1.5
                            prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-li:leading-relaxed
                            prose-hr:border-border prose-hr:my-3
                            prose-a:text-accent-blue prose-a:break-words prose-a:underline-offset-2
                            prose-blockquote:border-l-accent-blue/40 prose-blockquote:text-muted-foreground
                            prose-table:text-xs prose-table:my-2
                            prose-th:px-2 prose-th:py-1 prose-th:text-left prose-th:font-semibold
                            prose-td:px-2 prose-td:py-1 prose-td:align-top
                            prose-pre:overflow-x-auto prose-pre:max-w-full prose-pre:text-xs
                            prose-code:text-accent-blue prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-code:break-words"
                        >
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        streaming && i === messages.length - 1 && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )
                      )}
                    </div>
                  </article>
                );
              })}

              {/* F. Honest analyzing state */}
              {toolStatus && (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {toolStatus}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* ── H. Persistent workflow action bar ─────────────────────────── */}
        <nav aria-label="Continue your workflow" className="mt-2 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <span className="shrink-0 pr-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Continue
            </span>
            {workflowLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="shrink-0 whitespace-nowrap rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground transition-colors duration-200 hover:bg-muted/60"
              >
                {link.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={startNewAnalysis}
              className="shrink-0 whitespace-nowrap rounded-md border border-accent-blue/40 bg-accent-blue/10 px-2.5 py-1.5 text-xs font-medium text-accent-blue transition-colors duration-200 hover:bg-accent-blue/20"
            >
              New Analysis
            </button>
          </div>
        </nav>

        {/* ── E. Premium composer ───────────────────────────────────────── */}
        <div className="mt-2 shrink-0 rounded-xl border border-border bg-card/70 p-2.5 sm:p-3">
          {limitReached && (
            <div className="mb-2.5 rounded-lg border border-accent-blue/40 bg-accent-blue/5 px-3 py-2.5">
              <p className="mb-2 text-sm text-foreground">
                You've reached today's free AI message limit. Pro access unlocks expanded AI research limits.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/pro")}
                  className="rounded-md bg-accent-blue px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Request Pro Access
                </button>
                <button
                  type="button"
                  onClick={() => setLimitReached(false)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Workflow indication when the selector grid is scrolled away */}
          {messages.length > 0 && (
            <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1">
              {ANALYST_WORKFLOWS.map((w) => {
                const Icon = WORKFLOW_ICONS[w.icon];
                const selected = w.id === selectedWorkflowId;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => selectWorkflow(w.id)}
                    aria-pressed={selected}
                    aria-label={`${w.name} — ${w.bestFor}`}
                    title={w.bestFor}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs transition-colors duration-200",
                      selected
                        ? "border-accent-blue/60 bg-accent-blue/10 font-medium text-accent-blue"
                        : "border-border bg-card text-muted-foreground hover:bg-muted/60"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {w.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Selected workflow + D. analysis-depth control */}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="font-semibold uppercase tracking-wide">Workflow</span>
              <span className="truncate text-foreground">{activeWorkflow.name}</span>
            </span>
            <div
              role="group"
              aria-label="Analysis depth"
              className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5"
            >
              {ANALYSIS_DEPTH_OPTIONS.map((opt) => {
                const accessible = canUseModel(opt.minPlan);
                const active = selectedModel === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={active}
                    aria-label={`${opt.label} — ${opt.description}`}
                    title={opt.description}
                    onClick={() => {
                      if (accessible) {
                        setSelectedModel(opt.value);
                      } else {
                        navigate("/pro");
                      }
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-200",
                      active
                        ? "bg-accent-blue text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted",
                      !accessible && "opacity-60"
                    )}
                  >
                    {opt.label}
                    {!accessible && <LockIcon className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          </div>

          {attachment && (
            <div className="mb-2 flex items-center gap-2 px-0.5">
              <span className="max-w-[220px] truncate text-xs text-muted-foreground">
                {attachment.fileName}
              </span>
              <button
                type="button"
                onClick={() => applyAttachment(null)}
                aria-label="Remove attachment"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {promptKept && (
            <p className="mb-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
              Workflow switched. Your edited prompt was kept — clear the box to load the new
              template.
            </p>
          )}

          {voiceError && (
            <div className="mb-2 flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
              <p className="flex-1 text-xs text-muted-foreground">{voiceError}</p>
              <button
                type="button"
                onClick={() => setVoiceError(null)}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Dismiss"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={handleFileSelect}
          />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (promptKept) setPromptKept(false);
            }}
            onKeyDown={handleKeyDown}
            disabled={composerDisabled}
            aria-label="Analysis prompt"
            placeholder="Ask about a setup, ticker, or market condition..."
            rows={1}
            className={cn(
              "w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm",
              "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue",
              "min-h-[44px] max-h-[160px] overflow-y-auto transition-colors duration-200",
              composerDisabled && "cursor-not-allowed opacity-60"
            )}
          />

          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {voiceSupported && (
                <button
                  type="button"
                  onClick={() => (isListening ? stopListening() : startListening())}
                  disabled={streaming}
                  aria-label={isListening ? "Stop voice input" : "Start voice input"}
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
                    isListening
                      ? "animate-pulse bg-green-500 text-white"
                      : "border border-border bg-card text-muted-foreground hover:bg-muted",
                    streaming && "cursor-not-allowed opacity-60"
                  )}
                >
                  {isListening ? <AudioLines className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              )}
              <button
                type="button"
                onClick={() => (isPro ? fileInputRef.current?.click() : navigate("/pro"))}
                disabled={streaming}
                aria-label="Attach a PDF or image"
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground",
                  "transition-colors duration-200 hover:bg-muted",
                  (!isPro || streaming) && "opacity-60",
                  streaming && "cursor-not-allowed"
                )}
              >
                <Paperclip className="h-4 w-4" />
              </button>
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">
                Enter to analyze · Shift+Enter for a new line
              </span>
              <button
                type="button"
                onClick={() => sendMessage(input)}
                disabled={composerDisabled || !input.trim()}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-accent-blue px-4 text-sm font-semibold text-primary-foreground",
                  "transition-opacity duration-200 hover:opacity-90",
                  (composerDisabled || !input.trim()) && "cursor-not-allowed opacity-50"
                )}
              >
                {streaming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Analyze
                  </>
                )}
              </button>
            </div>
          </div>

          <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
            Stocksist Intelligence • Not financial advice
            <br />
            <span className="opacity-80">
              AI may be wrong. Market data can be delayed. Verify before trading.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
