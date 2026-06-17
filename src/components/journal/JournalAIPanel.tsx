import { useEffect, useRef, useState } from "react";
import { X, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { streamChat, type ChatMessage } from "@/lib/chat";
import type { Trade } from "./TradeTable";

type Stats = {
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_pnl: number;
};

interface JournalAIPanelProps {
  open: boolean;
  onClose: () => void;
  userId: string;
}

const WELCOME: ChatMessage = {
  role: "assistant",
  content:
    "I have access to your trade journal. Ask me anything about your performance, patterns, or how to improve.",
};

const SUGGESTED = [
  "What's my biggest weakness?",
  "Which setup is working best?",
  "How can I improve my win rate?",
];

export default function JournalAIPanel({ open, onClose, userId }: JournalAIPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [sessionToken] = useState(() => crypto.randomUUID());
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !userId) return;
    (async () => {
      const [t, s] = await Promise.all([
        supabase
          .from("journal_trades")
          .select("*")
          .eq("user_id", userId)
          .eq("status", "closed")
          .order("exit_date", { ascending: false })
          .limit(10),
        supabase
          .from("journal_stats_cache")
          .select("total_trades,wins,losses,win_rate,total_pnl")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      setTrades((t.data as Trade[] | null) ?? []);
      setStats((s.data as Stats | null) ?? null);
    })();
  }, [open, userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const buildContext = (): string => {
    const winRatePct = stats ? Math.round((stats.win_rate ?? 0) * 100) : 0;
    const totalPnl = stats ? stats.total_pnl?.toFixed(2) ?? "0" : "0";
    const tradesStr = trades.length
      ? trades
          .map(
            (t) =>
              `${t.symbol} ${String(t.side).toUpperCase()} — Entry: $${t.entry_price}, Exit: $${t.exit_price}, Return: ${
                (t.return_dollars ?? 0) > 0 ? "+" : ""
              }$${t.return_dollars} (${t.return_pct}%), Setup: ${t.setup_tag ?? "untagged"}`
          )
          .join("\n")
      : "No closed trades yet.";

    return `You are an expert trading coach and journal analyst. The user has given you access to their HedgeFun Stock Journal.

Their overall stats: ${stats?.total_trades ?? 0} trades, ${winRatePct}% win rate, total P&L: $${totalPnl}.

Their last 10 closed trades:
${tradesStr}

Only discuss trading, stocks, and the user's journal data. Do not answer questions unrelated to trading or financial markets. Be direct, specific, and reference their actual trades when relevant.`;
  };

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || loading) return;
    const userMsg: ChatMessage = { role: "user", content };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    const contextMsg: ChatMessage = {
      role: "user",
      content: `[CONTEXT]\n${buildContext()}`,
    };

    let assistantContent = "";
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    const { data: { session } } = await supabase.auth.getSession();

    await streamChat({
      messages: [contextMsg, ...next],
      sessionToken,
      accessToken: session?.access_token,
      onDelta: (delta) => {
        assistantContent += delta;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: assistantContent };
          return updated;
        });
      },
      onDone: () => setLoading(false),
      onError: (err) => {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: `Error: ${err}` };
          return updated;
        });
        setLoading(false);
      },
    });
  };

  return (
    <div
      className={`fixed right-0 top-0 h-full w-80 bg-surface-card border-l border-border z-40 shadow-xl flex flex-col transition-transform duration-300 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Ask AI · Journal</h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close AI panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex flex-col flex-1 overflow-y-auto p-3 gap-2">
        {messages.map((m, i) => {
          const isLastAssistant =
            m.role === "assistant" && i === messages.length - 1 && loading;
          return (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`rounded-xl px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap leading-relaxed ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {m.content}
                {isLastAssistant && (
                  <span className="inline-block w-1 h-3 bg-primary ml-0.5 animate-pulse align-middle" />
                )}
              </div>
            </div>
          );
        })}

        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {SUGGESTED.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setInput(s);
                  send(s);
                }}
                disabled={loading}
                className="text-xs px-2.5 py-1.5 rounded-full border border-border bg-background hover:bg-muted text-foreground transition-colors disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-3">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            disabled={loading}
            placeholder="Ask about your trades..."
            className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className="shrink-0 h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 transition-opacity"
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
