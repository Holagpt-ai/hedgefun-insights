import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Sparkles, Lock as LockIcon, Paperclip, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { streamChat, ChatMessage } from "@/lib/chat";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const QUICK_PROMPTS = [
  { label: "Today's Gappers", prompt: "What are the top gappers today and what's driving them?" },
  { label: "AM Prep Brief", prompt: "Give me a pre-market briefing: key levels, catalysts, and what to watch today." },
  { label: "Scan My Watchlist", prompt: "Based on what you know about my watchlist and trading style, what setups should I be looking at today?" },
  { label: "Earnings This Week", prompt: "What are the most important earnings reports this week? Summarize key expectations and potential market impact." },
  { label: "Flat Top Breakout", prompt: "Explain the Flat Top Breakout setup: ideal entry, confirmation signals, stop placement, and target." },
  { label: "Market Mood", prompt: "What is the overall market mood right now? Breadth, sentiment, and key macro factors driving the tape." },
];

const MODEL_OPTIONS = [
  { label: "Fast", value: "claude-haiku-4-5-20251001", minPlan: "free" },
  { label: "Standard", value: "claude-sonnet-4-6", minPlan: "pro" },
  { label: "Deep Analysis", value: "claude-opus-4-6", minPlan: "unlimited" },
];

interface AIAnalystChatProps {
  isPro: boolean;
  userName?: string;
  userPlan: string;
}

export function AIAnalystChat({ isPro, userName, userPlan }: AIAnalystChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [selectedModel, setSelectedModel] = useState("claude-haiku-4-5-20251001");
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachment, setAttachment] = useState<{ type: 'pdf' | 'image'; data: string; mediaType: string; fileName: string } | null>(null);

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const canUseModel = (minPlan: string) => {
    if (minPlan === "free") return true;
    if (minPlan === "pro") return userPlan === "pro" || userPlan === "admin" || userPlan === "unlimited";
    if (minPlan === "unlimited") return userPlan === "unlimited" || userPlan === "admin";
    return false;
  };

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || streaming) return;
      const userMessage: ChatMessage = { role: "user", content: content.trim() };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput("");
      setStreaming(true);

      let assistantContent = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const { data: { session } } = await supabase.auth.getSession();

      await streamChat({
        messages: newMessages,
        sessionToken,
        accessToken: session?.access_token,
        model: selectedModel,
        attachment: attachment ?? undefined,
        onDelta: (delta) => {
          assistantContent += delta;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: assistantContent };
            return updated;
          });
        },
        onDone: () => {
          setStreaming(false);
          setAttachment(null);
        },
        onError: (err) => {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: `Error: ${err}` };
            return updated;
          });
          setStreaming(false);
        },
      });
    },
    [messages, streaming, sessionToken, selectedModel, attachment]
  );

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
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto px-4 py-6">
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
                disabled={!isPro || streaming}
                className={cn(
                  "text-left px-4 py-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors duration-200",
                  "text-sm font-medium text-foreground",
                  (!isPro || streaming) && "opacity-50 cursor-not-allowed"
                )}
              >
                {qp.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed",
                  msg.role === "user"
                    ? "bg-accent-blue text-primary-foreground"
                    : "bg-card border border-border text-foreground"
                )}
              >
                {msg.content || (streaming && i === messages.length - 1 ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : "")}
              </div>
            </div>
          ))}
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
                if (accessible) setSelectedModel(opt.value);
              }}
              disabled={!accessible}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200",
                active
                  ? "bg-accent-blue text-primary-foreground"
                  : "bg-card border border-border text-foreground hover:bg-muted",
                !accessible && "opacity-50 cursor-not-allowed hover:bg-card"
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
        {!isPro && (
          <div className="mb-2 text-xs text-center text-muted-foreground">
            PRO feature — Upgrade to unlock AI Analyst
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isPro || streaming}
            placeholder={isPro ? "Ask about a setup, ticker, or market condition..." : "Upgrade to PRO to use AI Analyst"}
            rows={1}
            className={cn(
              "flex-1 resize-none rounded-lg border border-border bg-card px-4 py-3 text-sm",
              "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue",
              "transition-colors duration-200 min-h-[44px] max-h-[120px]",
              (!isPro || streaming) && "opacity-60 cursor-not-allowed"
            )}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!isPro || streaming || !input.trim()}
            className={cn(
              "shrink-0 h-11 w-11 rounded-lg bg-accent-blue text-primary-foreground",
              "flex items-center justify-center transition-opacity duration-200",
              (!isPro || streaming || !input.trim()) && "opacity-50 cursor-not-allowed"
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
  );
}
