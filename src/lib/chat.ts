// Client-side streaming chat helper for Stocksist AI
const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

export type ChatSseFrame =
  | { kind: "done" }
  | { kind: "error"; error: string }
  | { kind: "reset" }
  | { kind: "conversation"; id: string }
  | { kind: "delta"; text: string }
  | { kind: "ignore" }
  | { kind: "malformed" };

/** Classify one SSE data payload from the chat edge function. */
export function interpretChatSseData(jsonStr: string): ChatSseFrame {
  if (jsonStr === "[DONE]") return { kind: "done" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { kind: "malformed" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { kind: "ignore" };
  const record = parsed as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.length > 0) {
    return { kind: "error", error: record.error };
  }
  if (record.type === "reset_assistant") return { kind: "reset" };
  if (record.type === "conversation_id" && typeof record.id === "string" && record.id.length > 0) {
    return { kind: "conversation", id: record.id };
  }
  const choices = record.choices;
  const first = Array.isArray(choices) ? choices[0] as { delta?: { content?: unknown } } | undefined : undefined;
  const content = first?.delta?.content;
  if (typeof content === "string" && content.length > 0) return { kind: "delta", text: content };
  return { kind: "ignore" };
}

/** Client-side ceiling for a single streamed analysis request (fetch + SSE body). */
export const CHAT_REQUEST_TIMEOUT_MS = 90_000;

/** Surfaced via onError when the client timeout fires (not a provider code). */
export const CHAT_REQUEST_TIMEOUT_ERROR = "REQUEST_TIMEOUT";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatAttachment = { type: "pdf" | "image"; data: string; mediaType: string; fileName: string };

export async function streamChat({
  messages,
  sessionToken,
  accessToken,
  model,
  attachment,
  systemContext,
  historicalMemory,
  analystIntelligence,
  conversationId,
  signal,
  onDelta,
  onDone,
  onError,
  onConversationId,
  onReset,
}: {
  messages: ChatMessage[];
  sessionToken: string;
  accessToken?: string;
  model?: string;
  attachment?: ChatAttachment;
  systemContext?: string;
  /** Deterministic same-security historical evidence (Repeat Movers). */
  historicalMemory?: object | null;
  /** Symbol-scoped verified intelligence packet (Prompt #19). */
  analystIntelligence?: object | null;
  conversationId?: string;
  signal?: AbortSignal;
  onDelta: (deltaText: string) => void;
  onDone: () => void;
  onError?: (error: string) => void;
  onConversationId?: (id: string) => void;
  /** Drop assistant text already streamed because a tool call superseded it. */
  onReset?: () => void;
}) {
  const timeoutController = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, CHAT_REQUEST_TIMEOUT_MS);

  const forwardCallerAbort = () => {
    timeoutController.abort();
  };

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      throw new DOMException("Aborted", "AbortError");
    }
    signal.addEventListener("abort", forwardCallerAbort);
  }

  try {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        messages,
        sessionToken,
        model,
        attachment,
        systemContext,
        historicalMemory,
        analystIntelligence,
        conversationId,
      }),
      signal: timeoutController.signal,
    });

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({ error: "Chat failed" }));
      onError?.(errorData.error || "Chat failed");
      return;
    }

    // Tier-gated errors (DAILY_LIMIT_REACHED, SIGNUP_PROMPT) now come back as HTTP 200
    // with a JSON body instead of an SSE stream. Detect by content-type and surface via onError.
    const contentType = resp.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const errorData = await resp.json().catch(() => ({ error: "Chat failed" }));
      onError?.(errorData.error || "Chat failed");
      return;
    }

    if (!resp.body) {
      onError?.("No response body");
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          const frame = interpretChatSseData(jsonStr);
          if (frame.kind === "malformed") {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
          if (frame.kind === "done") {
            onDone();
            return;
          }
          if (frame.kind === "error") {
            onError?.(frame.error);
            return;
          }
          if (frame.kind === "reset") {
            onReset?.();
            continue;
          }
          if (frame.kind === "conversation") {
            onConversationId?.(frame.id);
            continue;
          }
          if (frame.kind === "delta") onDelta(frame.text);
        }
      }

      onDone();
    } finally {
      // Release the stream on every exit path: completion, abort, or read failure.
      void reader.cancel().catch(() => {});
    }
  } catch (err) {
    if (timedOut) {
      onError?.(CHAT_REQUEST_TIMEOUT_ERROR);
      return;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", forwardCallerAbort);
  }
}
