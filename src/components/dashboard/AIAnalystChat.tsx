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
  Clock,
  Mic,
  AudioLines,
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
import { streamChat, ChatMessage, CHAT_REQUEST_TIMEOUT_ERROR } from "@/lib/chat";
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

const TIMEOUT_FAILURE_MESSAGE = "The analysis took too long. Please try again.";

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

export function AIAnalystChat({ isPro, userName, userPlan }: AIAnalystChatProps) {
  const { user, loading: authLoading, profile } = useAuth();
  // Session may resolve before the profile/plan row arrives — do not consume
  // ticker handoffs while Pro vs Free is still unknown.
  const entitlementPending = authLoading || (user != null && profile == null);
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
    textareaRef.current?.focus();
    toast({
      title: "New analysis ready",
      description: "Choose a workflow or enter your request.",
    });
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

  useEffect(() => {
    if (!historyOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHistoryOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [historyOpen]);

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

  const resolveSubmissionPrompt = useCallback(
    (content: string) => {
      if (content.trim()) return content;
      if (!attachmentRef.current) return "";
      return getAnalystWorkflow(selectedWorkflowId).buildPrompt(activeSymbolRef.current);
    },
    [selectedWorkflowId]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      const effectivePrompt = resolveSubmissionPrompt(content);
      if (!effectivePrompt.trim() || inFlightRef.current) return;

      const requestId = ++requestIdRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      inFlightRef.current = true;

      // A superseded or unmounted request may no longer write to the screen.
      const isCurrent = () => requestIdRef.current === requestId && !unmountedRef.current;

      commitMessages([...messagesRef.current, { role: "user", content: effectivePrompt }]);
      setInput("");
      setPromptKept(false);
      presetDraftRef.current = "";
      setStreaming(true);
      lastAttemptedPromptRef.current = effectivePrompt;

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
            if (code === CHAT_REQUEST_TIMEOUT_ERROR) {
              appendAssistant(`Error: ${TIMEOUT_FAILURE_MESSAGE}`);
              return;
            }
            appendAssistant(`Error: ${GENERIC_FAILURE_MESSAGE}`);
          },
        });
      } catch (err) {
        // An abort is an intentional cancellation, never a failure to report.
        // Timeouts are surfaced via onError(REQUEST_TIMEOUT), not this path.
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
      resolveSubmissionPrompt,
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

    // Keep ?symbol= / ?prompt= until Pro vs Free is definitive.
    if (entitlementPending) return;

    // Guards against effect rerenders replaying the same handoff. It is not a
    // permanent latch: it is released above once the params are gone.
    const token = `s:${rawSymbol ?? ""}|p:${rawPrompt ?? ""}`;
    if (handoffTokenRef.current === token) return;
    // Claim before clearing the URL or submitting so Strict Mode / dep churn
    // cannot double-consume the same handoff.
    handoffTokenRef.current = token;

    if (rawSymbol !== null) {
      const symbol = normalizeHandoffSymbol(rawSymbol);
      // Invalid or empty symbols never produce an analysis request.
      if (!symbol) {
        setSearchParams({}, { replace: true });
        return;
      }

      // A different ticker becomes a clean analysis context.
      if (activeSymbolRef.current && activeSymbolRef.current !== symbol) {
        cancelActiveRequest();
        commitMessages([]);
        applyConversationId(null);
        applyAttachment(null);
        lastAttemptedPromptRef.current = "";
      }
      setActiveWorkflowSymbol(symbol);

      const synthesized = buildSymbolPrompt(symbol);

      // Remove the param only after the handoff is safely claimed.
      setSearchParams({}, { replace: true });

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
    entitlementPending,
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

  const normalizedPlan = (userPlan ?? "").trim().toLowerCase();
  const registeredName = userName?.trim();
  const displayName =
    registeredName && registeredName.toLowerCase() !== "admin"
      ? registeredName.split(/\s+/)[0]
      : null;
  const accessTierLabel =
    normalizedPlan === "admin"
      ? "Unlimited"
      : ACCESS_TIER_LABELS[normalizedPlan] ?? "Free";
  const activeWorkflow = getAnalystWorkflow(selectedWorkflowId);

  // Catalyst, Journal, and Watchlist consume `?symbol=`. Chart uses the canonical
  // `/chart/:ticker` path (see App.tsx); bare `/chart` when no ticker is active.
  const symbolQuery = activeSymbol ? `?symbol=${encodeURIComponent(activeSymbol)}` : "";
  const workflowLinks = [
    { label: "Screeners", to: "/dashboard/screeners" },
    { label: "My Watchlist", to: `/dashboard/watchlist${symbolQuery}` },
    { label: "Catalyst", to: `/dashboard/catalyst${symbolQuery}` },
    { label: "Chart", to: activeSymbol ? `/chart/${encodeURIComponent(activeSymbol)}` : "/chart" },
    { label: "Action Center", to: "/dashboard/action-center" },
    { label: "Stock Journal", to: `/dashboard/journal${symbolQuery}` },
  ];

  const composerDisabled = streaming || limitReached;
  const hasSubmissionInput = input.trim().length > 0 || attachment !== null;

  return (
    <div className="relative mx-auto w-full min-w-0 max-w-5xl px-3 py-3 sm:px-5 sm:py-4">
      {/* History is always an overlay, so opening it never changes workspace width. */}
      {historyOpen && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setHistoryOpen(false)}
            className="fixed inset-0 z-40 bg-black/35"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="analysis-history-title"
            className="fixed inset-y-0 right-0 z-50 flex w-[min(92vw,22rem)] flex-col border-l border-border bg-card shadow-xl"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 id="analysis-history-title" className="text-sm font-semibold text-foreground">
                Analysis History
              </h2>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close history"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
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

      {/* Compact personalized greeting */}
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border/70 pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {displayName ? `Hello, ${displayName}` : "Hello"}
            </h1>
            <span className="rounded-full bg-accent-blue/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-blue">
              {accessTierLabel} Access
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            What would you like to analyze today?
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHistoryOpen(!historyOpen)}
            aria-haspopup="dialog"
            aria-expanded={historyOpen}
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            History
          </button>
          <button
            type="button"
            onClick={startNewAnalysis}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            New Analysis
          </button>
        </div>
      </header>

      {activeSymbol && (
        <div className="mt-3">
          <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-accent-blue/10 px-2 py-1 text-[11px] font-semibold text-accent-blue">
            <Target className="h-3 w-3 shrink-0" />
            <span className="truncate">Ticker · {activeSymbol}</span>
          </span>
        </div>
      )}

      {/* All six workflows remain directly visible in every conversation state. */}
      <section aria-labelledby="workflow-heading" className="mt-5">
        <h2
          id="workflow-heading"
          className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Choose a trading workflow
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ANALYST_WORKFLOWS.map((workflow) => {
            const Icon = WORKFLOW_ICONS[workflow.icon];
            const selected = workflow.id === selectedWorkflowId;
            return (
              <button
                key={workflow.id}
                type="button"
                onClick={() => selectWorkflow(workflow.id)}
                aria-pressed={selected}
                className={cn(
                  "flex min-w-0 items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors duration-200",
                  selected
                    ? "bg-accent-blue/10 ring-1 ring-inset ring-accent-blue/50"
                    : "bg-card hover:bg-muted/60"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md",
                    selected
                      ? "bg-accent-blue/15 text-accent-blue"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    {workflow.name}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {workflow.bestFor}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Composer follows the workflow decision in normal document flow. */}
      <section aria-label="Analysis composer" className="mt-4 rounded-xl bg-card p-3 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-semibold uppercase tracking-wide">Workflow</span>
            <span className="truncate text-foreground">{activeWorkflow.name}</span>
          </span>
          <div
            role="group"
            aria-label="Analysis depth"
            className="flex items-center gap-1 rounded-lg bg-muted/50 p-0.5"
          >
            {ANALYSIS_DEPTH_OPTIONS.map((option) => {
              const accessible = canUseModel(option.minPlan);
              const active = selectedModel === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${option.label} — ${option.description}`}
                  title={option.description}
                  onClick={() => {
                    if (accessible) {
                      setSelectedModel(option.value);
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
                  {option.label}
                  {!accessible && <LockIcon className="h-3 w-3" />}
                </button>
              );
            })}
          </div>
        </div>

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
                className="rounded-md px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

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
          <p className="mb-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] text-muted-foreground">
            Workflow switched. Your edited prompt was kept — clear the box to load the new
            template.
          </p>
        )}

        {voiceError && (
          <div className="mb-2 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2">
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
          onChange={(event) => {
            setInput(event.target.value);
            if (promptKept) setPromptKept(false);
          }}
          onKeyDown={handleKeyDown}
          disabled={composerDisabled}
          aria-label="Analysis prompt"
          placeholder="Ask about a setup, ticker, or market condition..."
          rows={1}
          className={cn(
            "min-h-[44px] max-h-[160px] w-full resize-none overflow-y-auto rounded-lg border border-border bg-background px-3 py-2.5 text-sm",
            "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue",
            "transition-colors duration-200",
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
                    : "text-muted-foreground hover:bg-muted",
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
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted",
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
              disabled={composerDisabled || !hasSubmissionInput}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-accent-blue px-4 text-sm font-semibold text-primary-foreground",
                "transition-opacity duration-200 hover:opacity-90",
                (composerDisabled || !hasSubmissionInput) && "cursor-not-allowed opacity-50"
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
      </section>

      {/* Related destinations are visible together and never horizontally scroll. */}
      <nav aria-labelledby="related-tools-heading" className="mt-5">
        <h2
          id="related-tools-heading"
          className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Related Tools
        </h2>
        <div className="flex flex-wrap gap-2">
          {workflowLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="rounded-md bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Conversation follows tools in normal document flow. */}
      <section
        ref={scrollContainerRef}
        aria-label="Analysis conversation"
        className="mt-6 space-y-3 pb-8"
      >
        {messages.map((message, index) => {
          const isErrorMessage =
            message.role === "assistant" && message.content.startsWith("Error:");
          if (isErrorMessage) {
            return (
              <div
                key={index}
                className="scroll-mt-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3"
              >
                <p className="mb-1 text-sm font-medium text-foreground">Something went wrong</p>
                <p className="mb-2 break-words text-xs text-muted-foreground">
                  {message.content.replace(/^Error:\s*/, "")}
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

          if (message.role === "user") {
            return (
              <div
                key={index}
                ref={index === messages.length - 1 ? lastUserMsgRef : undefined}
                className="flex scroll-mt-2 justify-end"
              >
                <div className="max-w-[85%] min-w-0 whitespace-pre-wrap break-words rounded-lg rounded-br-sm bg-accent-blue px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
                  {message.content}
                </div>
              </div>
            );
          }

          return (
            <article
              key={index}
              className="scroll-mt-2 overflow-hidden rounded-lg bg-card shadow-sm"
            >
              <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/30 px-3 py-1.5">
                <Terminal className="h-3 w-3 text-accent-blue" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Analyst Response
                </span>
              </div>
              <div className="min-w-0 px-3 py-3 sm:px-4">
                {message.content ? (
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
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                ) : (
                  streaming &&
                  index === messages.length - 1 && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )
                )}
              </div>
            </article>
          );
        })}

        {toolStatus && (
          <div className="flex items-center gap-2 rounded-lg bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {toolStatus}
          </div>
        )}
        <div ref={bottomRef} />
      </section>

      <p className="pb-4 text-center text-[11px] leading-relaxed text-muted-foreground">
        Stocksist Intelligence • Not financial advice
        <br />
        <span className="opacity-80">
          AI may be wrong. Market data can be delayed. Verify before trading.
        </span>
      </p>
    </div>
  );
}
