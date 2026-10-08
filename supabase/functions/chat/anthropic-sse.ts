/**
 * Incremental Anthropic Messages SSE parser.
 * Network reads are not assumed to align with event boundaries.
 */

export interface UsageSnapshot {
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_input_tokens: number | null;
  cache_creation_input_tokens: number | null;
}

export interface ToolUseCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  inputValid: boolean;
}

export type AssistantContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

export function emptyUsage(): UsageSnapshot {
  return {
    input_tokens: null,
    output_tokens: null,
    cache_read_input_tokens: null,
    cache_creation_input_tokens: null,
  };
}

export class AnthropicSseDecoder {
  private buffer = "";

  /** Push a decoded text chunk. Returns only complete, valid JSON events. */
  push(chunk: string): Record<string, unknown>[] {
    this.buffer += chunk;
    const events: Record<string, unknown>[] = [];
    while (true) {
      const sep = this.buffer.indexOf("\n");
      if (sep < 0) break;
      let line = this.buffer.slice(0, sep);
      this.buffer = this.buffer.slice(sep + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      const event = parseSseDataLine(line);
      if (event) events.push(event);
    }
    return events;
  }

  /** Parse a trailing line that arrived without a final newline. Incomplete JSON is dropped. */
  finish(): Record<string, unknown>[] {
    const rest = this.buffer;
    this.buffer = "";
    if (!rest.trim()) return [];
    let line = rest;
    if (line.endsWith("\r")) line = line.slice(0, -1);
    const event = parseSseDataLine(line);
    return event ? [event] : [];
  }
}

function parseSseDataLine(line: string): Record<string, unknown> | null {
  if (!line || line.startsWith(":") || line.startsWith("event:")) return null;
  if (!line.startsWith("data:")) return null;
  const jsonStr = line.slice(5).trim();
  if (!jsonStr || jsonStr === "[DONE]") return null;
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

type OpenBlock = {
  index: number;
  kind: "text" | "tool_use" | "other";
  text: string;
  id: string;
  name: string;
  partialJson: string;
  closed: boolean;
};

/**
 * Folds Anthropic stream events into content blocks.
 * Text deltas are forwarded immediately. Tool JSON is accumulated and never forwarded.
 */
export class AnthropicMessageAssembler {
  private open = new Map<number, OpenBlock>();
  content: AssistantContentBlock[] = [];
  toolUses: ToolUseCall[] = [];
  stopReason: string | null = null;
  usage: UsageSnapshot = emptyUsage();
  visibleText = "";
  providerErrorType: string | null = null;

  async consume(
    event: Record<string, unknown>,
    onText?: (text: string) => Promise<void> | void,
    onToolUseStart?: () => Promise<void> | void,
  ): Promise<void> {
    const type = event.type;
    if (type === "message_start") {
      const message = event.message;
      if (message && typeof message === "object" && !Array.isArray(message)) {
        mergeUsage(this.usage, (message as Record<string, unknown>).usage, "start");
      }
      return;
    }

    if (type === "content_block_start") {
      const index = typeof event.index === "number" ? event.index : this.open.size;
      if (this.open.has(index)) return;
      const block = event.content_block;
      const blockRec = block && typeof block === "object" && !Array.isArray(block)
        ? block as Record<string, unknown>
        : null;
      const kindRaw = blockRec?.type;
      const kind = kindRaw === "text" || kindRaw === "tool_use" ? kindRaw : "other";
      this.open.set(index, {
        index,
        kind,
        text: "",
        id: kind === "tool_use" && typeof blockRec?.id === "string" ? blockRec.id : "",
        name: kind === "tool_use" && typeof blockRec?.name === "string" ? blockRec.name : "",
        partialJson: "",
        closed: false,
      });
      if (kind === "tool_use" && onToolUseStart) await onToolUseStart();
      return;
    }

    if (type === "content_block_delta") {
      const index = typeof event.index === "number" ? event.index : -1;
      const open = this.open.get(index);
      const delta = event.delta;
      if (!open || open.closed || !delta || typeof delta !== "object" || Array.isArray(delta)) return;
      const d = delta as Record<string, unknown>;
      if (d.type === "text_delta" && open.kind === "text" && typeof d.text === "string" && d.text.length > 0) {
        open.text += d.text;
        this.visibleText += d.text;
        if (onText) await onText(d.text);
        return;
      }
      if (d.type === "input_json_delta" && open.kind === "tool_use" && typeof d.partial_json === "string") {
        open.partialJson += d.partial_json;
      }
      return;
    }

    if (type === "content_block_stop") {
      const index = typeof event.index === "number" ? event.index : -1;
      const open = this.open.get(index);
      if (!open || open.closed) return;
      open.closed = true;
      if (open.kind === "text") {
        if (open.text.length > 0) this.content.push({ type: "text", text: open.text });
        return;
      }
      if (open.kind === "tool_use") {
        const parsed = parseToolInput(open.partialJson);
        this.content.push({
          type: "tool_use",
          id: open.id,
          name: open.name,
          input: parsed.input,
        });
        this.toolUses.push({
          id: open.id,
          name: open.name,
          input: parsed.input,
          inputValid: parsed.inputValid,
        });
      }
      return;
    }

    if (type === "message_delta") {
      const delta = event.delta;
      if (delta && typeof delta === "object" && !Array.isArray(delta)) {
        const reason = (delta as Record<string, unknown>).stop_reason;
        if (typeof reason === "string" && reason.length > 0) this.stopReason = reason;
      }
      mergeUsage(this.usage, event.usage, "delta");
      return;
    }

    if (type === "error") {
      const err = event.error;
      if (err && typeof err === "object" && !Array.isArray(err)) {
        const errorType = (err as Record<string, unknown>).type;
        if (typeof errorType === "string") this.providerErrorType = errorType;
      }
    }
  }
}

function parseToolInput(partialJson: string): { input: Record<string, unknown>; inputValid: boolean } {
  const raw = partialJson.trim();
  if (!raw) return { input: {}, inputValid: true };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { input: parsed as Record<string, unknown>, inputValid: true };
    }
    return { input: {}, inputValid: false };
  } catch {
    return { input: {}, inputValid: false };
  }
}

function mergeUsage(target: UsageSnapshot, raw: unknown, phase: "start" | "delta"): void {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const u = raw as Record<string, unknown>;
  const num = (key: string): number | null => (typeof u[key] === "number" ? u[key] as number : null);
  if (phase === "start") {
    const input = num("input_tokens");
    if (input !== null) target.input_tokens = input;
    const cacheRead = num("cache_read_input_tokens");
    if (cacheRead !== null) target.cache_read_input_tokens = cacheRead;
    const cacheCreate = num("cache_creation_input_tokens");
    if (cacheCreate !== null) target.cache_creation_input_tokens = cacheCreate;
    return;
  }
  const output = num("output_tokens");
  if (output !== null) target.output_tokens = output;
  const input = num("input_tokens");
  if (input !== null) target.input_tokens = input;
  const cacheRead = num("cache_read_input_tokens");
  if (cacheRead !== null) target.cache_read_input_tokens = cacheRead;
  const cacheCreate = num("cache_creation_input_tokens");
  if (cacheCreate !== null) target.cache_creation_input_tokens = cacheCreate;
}
