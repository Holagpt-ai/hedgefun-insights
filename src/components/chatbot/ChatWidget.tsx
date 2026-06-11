import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, ArrowLeft, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { streamChat, type ChatMessage } from "@/lib/chat";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const WELCOME_MSG =
  "Hi! I'm HedgeFun AI. Ask me anything about stocks, ETFs, earnings, or market analysis. What's on your radar today?";

const SUGGESTED = [
  "What is a P/E ratio?",
  "Explain dollar-cost averaging",
  "What moves stock prices?",
  "How do I read an earnings report?",
];

function getSessionToken(): string {
  let token = sessionStorage.getItem("hedgefun-chat-session");
  if (!token) {
    token = crypto.randomUUID();
    sessionStorage.setItem("hedgefun-chat-session", token);
  }
  return token;
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pulsed, setPulsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user, profile } = useAuth();

  // Count user messages sent today (basic client-side estimate)
  const userMsgCount = messages.filter((m) => m.role === "user").length;
  const isFree = !profile?.plan || profile.plan === "free";
  const limitLabel = isFree && user ? `${userMsgCount}/10 free queries used today` : null;

  useEffect(() => {
    if (!pulsed) {
      const t = setTimeout(() => setPulsed(true), 3000);
      return () => clearTimeout(t);
    }
  }, [pulsed]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      setError(null);
      const userMsg: ChatMessage = { role: "user", content: text.trim() };
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setInput("");
      setLoading(true);
      trackEvent("chatbot_query");

      let assistantContent = "";
      setMessages([...newMessages, { role: "assistant", content: "" }]);

      const { data: { session } } = await supabase.auth.getSession();

      await streamChat({
        messages: newMessages,
        sessionToken: getSessionToken(),
        accessToken: session?.access_token,
        onDelta: (delta) => {
          assistantContent += delta;
          setMessages([...newMessages, { role: "assistant", content: assistantContent }]);
        },
        onDone: () => setLoading(false),
        onError: (err) => {
          setError(err);
          setLoading(false);
          // Remove empty assistant message on error
          setMessages(newMessages);
        },
      });
    },
    [messages, loading]
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-50 h-[52px] w-[52px] rounded-full bg-gradient-to-br from-accent-blue to-accent-blue-hover shadow-lg flex items-center justify-center text-primary-foreground hover:scale-105",
          !pulsed && "animate-pulse"
        )}
        style={{
          boxShadow: "0 0 12px 3px rgba(59, 130, 246, 0.25)",
          transition: "box-shadow 0.2s ease, transform 0.2s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 0 12px 3px rgba(59, 130, 246, 0.45)")}
        onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 0 12px 3px rgba(59, 130, 246, 0.25)")}
        aria-label="Open chat"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  const showSuggested = messages.length === 0;

  return (
    <div
      className={cn(
        "fixed z-50 bg-surface-card border border-border flex flex-col overflow-hidden",
        // Mobile: full screen. Desktop: bottom-right panel.
        "inset-0 md:inset-auto md:bottom-20 md:right-6 md:w-[400px] md:h-[520px] md:rounded-xl md:shadow-2xl"
      )}
      style={{ animation: "snap-in 0.2s ease-out" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface-card shrink-0">
        <button onClick={() => setOpen(false)} className="md:hidden" aria-label="Close">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div className="h-7 w-7 rounded-md bg-accent-blue flex items-center justify-center shrink-0">
          <span className="text-[0.625rem] font-bold text-primary-foreground">HF</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-none">HedgeFun AI</p>
          <p className="text-[0.625rem] text-muted-foreground">Powered by Gemini</p>
        </div>
        <button onClick={() => setOpen(false)} className="hidden md:block" aria-label="Close">
          <X className="h-5 w-5 text-muted-foreground hover:text-foreground" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Welcome */}
        <div className="flex justify-start">
          <div className="max-w-[85%] bg-muted text-foreground text-sm rounded-lg rounded-tl-none px-3 py-2">
            {WELCOME_MSG}
          </div>
        </div>

        {showSuggested && (
          <div className="flex flex-wrap gap-2 pt-1">
            {SUGGESTED.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="text-xs px-3 py-1.5 rounded-full border border-border bg-surface text-foreground hover:bg-accent transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] text-sm rounded-lg px-3 py-2 whitespace-pre-wrap",
                m.role === "user"
                  ? "bg-accent-blue text-primary-foreground rounded-tr-none"
                  : "bg-muted text-foreground rounded-tl-none"
              )}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && messages[messages.length - 1]?.content === "" && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg rounded-tl-none px-3 py-2 flex gap-1">
              <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red">{error}</p>}
      </div>

      {/* Footer */}
      <div className="border-t border-border p-3 space-y-2 shrink-0">
        {limitLabel && <p className="text-[0.625rem] text-muted-foreground text-center">{limitLabel}</p>}
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="Ask about any stock or market..."
            className="flex-1 h-9 text-sm bg-surface"
            disabled={loading}
          />
          <Button
            size="icon"
            className="h-9 w-9 bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground shrink-0"
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
