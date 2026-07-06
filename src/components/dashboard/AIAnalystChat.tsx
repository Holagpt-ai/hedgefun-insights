import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Send,
  Loader2,
  Sparkles,
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
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { streamChat, ChatMessage } from "@/lib/chat";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { useLanguage } from "@/contexts/LanguageContext";
import { ANALYST_PRESET_GROUPS, ANALYST_CONTEXT_CHIPS } from "@/config/ai-analyst-presets.config";

const STREAMING_STATUS_MESSAGES = [
  "Analyzing dashboard context…",
  "Checking your market setup…",
  "Reviewing screeners and watchlist…",
  "Drafting your response…",
];


const MODEL_OPTIONS = [
  { label: "Fast", value: "fast" as const, minPlan: "free" },
  { label: "Standard", value: "standard" as const, minPlan: "pro" },
  { label: "Deep Analysis", value: "deep" as const, minPlan: "unlimited" },
];

type ModelTier = "fast" | "standard" | "deep";

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
  const [attachment, setAttachment] = useState<{ type: 'pdf' | 'image'; data: string; mediaType: string; fileName: string } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkFiredRef = useRef(false);
  const lastAttemptedPromptRef = useRef<string>("");
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      setMessages(
        data.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }))
      );
      setConversationId(conv.id);
      setHistoryOpen(false);
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setHistoryOpen(false);
  };

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
      setAttachment({
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

  const fetchDashboardContext = async (): Promise<string> => {
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
        parts.push(`TODAY'S TOP GAPPERS (live screener data):\n${lines.join("\n")}`);
      }

      if (radarRes.data && radarRes.data.length > 0) {
        const lines = radarRes.data.map((r: any) =>
          `${r.symbol} (${r.company_name ?? r.symbol}): price $${r.price?.toFixed(2) ?? "—"} chg ${r.change_percent?.toFixed(1) ?? "—"}% RVOL ${r.rvol?.toFixed(1) ?? "—"}x vol ${r.volume ? (r.volume / 1_000_000).toFixed(1) + "M" : "—"}`
        );
        parts.push(`DAY TRADE RADAR (live screener data):\n${lines.join("\n")}`);
      }

      if (gainersRes.data && gainersRes.data.length > 0) {
        const lines = gainersRes.data.map((r: any) =>
          `${r.symbol} (${r.company_name ?? r.symbol}): price $${r.price?.toFixed(2) ?? "—"} chg ${r.change_percent?.toFixed(1) ?? "—"}%`
        );
        parts.push(`TOP GAINERS TODAY (live screener data):\n${lines.join("\n")}`);
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
      }

      return parts.join("\n\n");
    } catch {
      return "";
    }
  };

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || streaming) return;

      const systemContext = await fetchDashboardContext();

      const userMessage: ChatMessage = { role: "user", content: content.trim() };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput("");
      setStreaming(true);
      lastAttemptedPromptRef.current = content.trim();
      // Rotate friendly status lines while we wait for the first delta
      let statusIdx = 0;
      setToolStatus(STREAMING_STATUS_MESSAGES[0]);
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = setInterval(() => {
        statusIdx = (statusIdx + 1) % STREAMING_STATUS_MESSAGES.length;
        setToolStatus(STREAMING_STATUS_MESSAGES[statusIdx]);
      }, 2200);

      let assistantContent = "";

      const { data: { session } } = await supabase.auth.getSession();

      await streamChat({
        messages: newMessages,
        sessionToken,
        accessToken: session?.access_token,
        model: selectedModel,
        attachment: attachment ?? undefined,
        systemContext: systemContext || undefined,
        conversationId: conversationId ?? undefined,
        onConversationId: (id) => {
          setConversationId(id);
          setToolStatus(null);
        },
        onDelta: (delta) => {
          assistantContent += delta;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              const updated = [...prev];
              updated[updated.length - 1] = { role: "assistant", content: assistantContent };
              return updated;
            }
            // First delta — add the assistant bubble now
            return [...prev, { role: "assistant", content: assistantContent }];
          });
        },
        onDone: () => {
          setStreaming(false);
          setAttachment(null);
          setToolStatus(null);
        },
        onError: (err) => {
          setToolStatus(null);
          if (err === "DAILY_LIMIT_REACHED") {
            setLimitReached(true);
            setStreaming(false);
            return;
          }
          if (err === "SIGNUP_PROMPT") {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "Sign up for free to get more daily AI queries. No credit card required." },
            ]);
            setStreaming(false);
            return;
          }
          setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err}` }]);
          setStreaming(false);
        },
      });
    },
    [messages, streaming, sessionToken, selectedModel, attachment, user, conversationId]
  );

  useEffect(() => {
    if (deepLinkFiredRef.current) return;
    const prompt = searchParams.get("prompt");
    if (!prompt || !isPro) return;
    deepLinkFiredRef.current = true;
    setInput(decodeURIComponent(prompt));
    setSearchParams({}, { replace: true });
    const timer = setTimeout(() => {
      sendMessage(decodeURIComponent(prompt));
    }, 400);
    return () => clearTimeout(timer);
  }, [isPro, searchParams, setSearchParams, sendMessage]);



  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const displayName = userName?.split(" ")[0] ?? "Trader";

  return (
    <div className="flex h-full w-full">
      {/* History Sidebar */}
      {historyOpen && (
        <aside className="w-72 shrink-0 border-r border-border bg-card flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Chat History</h2>
            <button
              onClick={() => setHistoryOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close history"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={startNewChat}
            className="mx-3 mt-3 mb-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-accent-blue text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <PlusCircle className="h-4 w-4" />
            New Chat
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
      )}

      {/* Main Chat Area */}
      <div className="flex flex-col h-full w-full max-w-4xl mx-auto px-4 py-6">
        {/* History toggle bar */}
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setHistoryOpen(!historyOpen)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {historyOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <MessageSquare className="h-3.5 w-3.5" />
            History
          </button>
          {conversationId && (
            <button
              type="button"
              onClick={startNewChat}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              New Chat
            </button>
          )}
        </div>

        {messages.length === 0 && (
          <div className="flex-1 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-3 text-accent-blue">
              <Sparkles className="h-5 w-5" />
              <span className="text-sm font-medium uppercase tracking-wide">AI Analyst</span>
            </div>
            <h1 className="text-3xl font-semibold text-foreground mb-2">
              {greeting}, {displayName}.
            </h1>
            <p className="text-base text-muted-foreground mb-8">
              Your AI-powered trading analyst. Ask about setups, market conditions, earnings, or your watchlist.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.label}
                  onClick={() => sendMessage(qp.prompt)}
                  disabled={streaming}
                  className={cn(
                    "text-left px-4 py-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors duration-200",
                    "text-sm font-medium text-foreground",
                    streaming && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {qp.label}
                </button>
              ))}
            </div>
            {toolStatus && (
              <div className="flex justify-start mt-4">
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-card border border-border text-muted-foreground text-sm">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {toolStatus}
                </div>
              </div>
            )}
          </div>
        )}

        {messages.length > 0 && (
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto space-y-4 pb-4">

            {messages.map((msg, i) => (
              <div
                key={i}
                ref={msg.role === "user" && i === messages.length - 1 ? lastUserMsgRef : undefined}
                className={cn(
                  "flex scroll-mt-2",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-accent-blue text-primary-foreground whitespace-pre-wrap"
                      : "bg-card border border-border text-foreground"
                  )}
                >
                  {msg.role === "assistant" ? (
                    msg.content ? (
                      <div
                        className="prose prose-sm max-w-none text-foreground
                          prose-headings:text-foreground prose-headings:font-semibold
                          prose-strong:text-foreground prose-strong:font-semibold
                          prose-p:my-1 prose-headings:my-2
                          prose-ul:my-1 prose-ol:my-1 prose-li:my-0
                          prose-hr:border-border prose-hr:my-3
                          prose-table:text-sm prose-td:px-2 prose-td:py-1 prose-th:px-2 prose-th:py-1
                          prose-code:text-accent-blue prose-code:bg-muted prose-code:px-1 prose-code:rounded"
                      >
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      streaming && i === messages.length - 1 ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : ""
                    )
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
            {toolStatus && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-card border border-border text-muted-foreground text-sm">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {toolStatus}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Model selector segmented control */}
        <div className="flex gap-2 mb-3 justify-center">
          {MODEL_OPTIONS.map((opt) => {
            const accessible = canUseModel(opt.minPlan);
            const active = selectedModel === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  if (accessible) {
                    setSelectedModel(opt.value);
                  } else {
                    navigate("/pro");
                  }
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200",
                  active
                    ? "bg-accent-blue text-primary-foreground"
                    : "bg-card border border-border text-foreground hover:bg-muted",
                  !accessible && "opacity-60 hover:bg-card"
                )}
              >
                {opt.label}
                {!accessible && <LockIcon className="h-3 w-3" />}
              </button>
            );
          })}
        </div>

        {/* Input area */}
        <div className="border-t border-border pt-4 mt-auto">
          {limitReached && (
            <div className="mb-3 rounded-lg border border-accent-blue/40 bg-accent-blue/5 px-4 py-3">
              <p className="text-sm text-foreground mb-2">
                You've reached your daily limit of 5 messages. Your messages reset tomorrow — or upgrade to PRO for unlimited access.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/pro")}
                  className="text-xs font-semibold px-3 py-1.5 rounded-md bg-accent-blue text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  Upgrade to PRO
                </button>
                <button
                  type="button"
                  onClick={() => setLimitReached(false)}
                  className="text-xs font-medium px-3 py-1.5 rounded-md border border-border text-foreground hover:bg-muted transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
          {attachment && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-xs text-muted-foreground truncate max-w-[200px]">{attachment.fileName}</span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {voiceError && (
            <div className="flex items-start gap-2 mb-2 px-3 py-2 rounded-lg border border-border bg-muted/40">
              <p className="text-xs text-muted-foreground flex-1">{voiceError}</p>
              <button
                type="button"
                onClick={() => setVoiceError(null)}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
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
          <div className="flex gap-2 items-end">
            {voiceSupported && (
              <button
                type="button"
                onClick={() => (isListening ? stopListening() : startListening())}
                disabled={streaming}
                aria-label={isListening ? "Stop voice input" : "Start voice input"}
                className={cn(
                  "shrink-0 h-11 w-11 rounded-full flex items-center justify-center transition-all duration-200",
                  isListening
                    ? "bg-green-500 text-white animate-pulse"
                    : "border border-border bg-card text-muted-foreground hover:bg-muted",
                  streaming && "opacity-60 cursor-not-allowed"
                )}
              >
                {isListening ? <AudioLines className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => (isPro ? fileInputRef.current?.click() : navigate("/pro"))}
              disabled={streaming}
              className={cn(
                "shrink-0 h-11 w-11 rounded-lg border border-border bg-card text-muted-foreground",
                "flex items-center justify-center transition-colors duration-200 hover:bg-muted",
                (!isPro || streaming) && "opacity-60",
                streaming && "cursor-not-allowed"
              )}
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={streaming || limitReached}
              placeholder="Ask about a setup, ticker, or market condition..."
              rows={1}
              className={cn(
                "flex-1 resize-none rounded-lg border border-border bg-card px-4 py-3 text-sm",
                "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue",
                "transition-colors duration-200 min-h-[44px] max-h-[120px]",
                (streaming || limitReached) && "opacity-60 cursor-not-allowed"
              )}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={streaming || !input.trim() || limitReached}
              className={cn(
                "shrink-0 h-11 w-11 rounded-lg bg-accent-blue text-primary-foreground",
                "flex items-center justify-center transition-opacity duration-200",
                (streaming || !input.trim() || limitReached) && "opacity-50 cursor-not-allowed"
              )}
            >
              {streaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground text-center mt-2">
            HedgeFun AI • Powered by Claude • Not financial advice
          </p>
        </div>
      </div>
    </div>
  );
}
