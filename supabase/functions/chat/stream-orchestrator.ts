/**
 * Streaming tool-use turn for Stocksist chat.
 *
 * Ordinary answers stream from the first Anthropic response. A second model
 * request is made only after at least one tool call has been executed.
 *
 * Text deltas are forwarded as they arrive so no-tool replies stay progressive.
 * Tool JSON is never forwarded. Text that arrives before a tool_use block is
 * provisional: the client is told to drop it, and it is excluded from the
 * kept answer. A short flash can still occur before that reset event. Holding
 * every token until message_stop would buffer ordinary answers.
 *
 * Tool rounds are capped at one continuation (two model requests total),
 * matching the previous probe-plus-answer depth without an open loop.
 */

import {
  formatAnthropicHttpErrorLog,
  readAnthropicErrorType,
} from "../_shared/ai/anthropic-error.ts";
import {
  AnthropicMessageAssembler,
  AnthropicSseDecoder,
  type ToolUseCall,
  type UsageSnapshot,
  emptyUsage,
} from "./anthropic-sse.ts";

export const MAX_TOOL_ROUNDS = 1;
export const MAX_MODEL_REQUESTS_PER_TURN = MAX_TOOL_ROUNDS + 1;

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ChatRequestStage = "answer" | "tool_continuation";

export interface ChatRequestUsage {
  correlation_id: string;
  model: string;
  stage: ChatRequestStage;
  request_index: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_input_tokens: number | null;
  cache_creation_input_tokens: number | null;
  tool_calls_executed: number;
  latency_ms: number;
  ok: boolean;
}

export interface ChatTurnOutcome {
  requestCount: number;
  toolUses: ToolUseCall[];
  /** Answer text that should remain after any provisional tool preamble is dropped. */
  assistantText: string;
  requests: ChatRequestUsage[];
  ok: boolean;
  /** The tool continuation was attempted and did not produce a final answer. */
  continuationFailed: boolean;
}

/** Persist an assistant answer only after a completed turn with visible text. */
export function shouldPersistChatAnswer(ok: boolean, content: string): boolean {
  return ok && content.length > 0;
}

export class StreamClientClosed extends Error {
  constructor() {
    super("client_closed");
    this.name = "StreamClientClosed";
  }
}

export interface ToolExecutionResult {
  content: string;
  isError?: boolean;
}

type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

export function formatChatAnthropicRequest(entry: ChatRequestUsage): string {
  return JSON.stringify({
    event: "chat_anthropic_usage",
    correlation_id: entry.correlation_id,
    model: entry.model,
    stage: entry.stage,
    request_index: entry.request_index,
    input_tokens: entry.input_tokens,
    output_tokens: entry.output_tokens,
    cache_read_input_tokens: entry.cache_read_input_tokens,
    cache_creation_input_tokens: entry.cache_creation_input_tokens,
    tool_calls_executed: entry.tool_calls_executed,
    latency_ms: entry.latency_ms,
    ok: entry.ok,
  });
}

export function logChatAnthropicRequest(entry: ChatRequestUsage): void {
  console.log(formatChatAnthropicRequest(entry));
}

export function logFailedChatRequest(
  correlationId: string,
  model: string,
  stage: ChatRequestStage,
  latencyMs: number,
  requestIndex = 1,
): void {
  logChatAnthropicRequest({
    correlation_id: correlationId,
    model,
    stage,
    request_index: requestIndex,
    input_tokens: null,
    output_tokens: null,
    cache_read_input_tokens: null,
    cache_creation_input_tokens: null,
    tool_calls_executed: 0,
    latency_ms: latencyMs,
    ok: false,
  });
}

function formatTurnSummary(args: {
  correlationId: string;
  model: string;
  requests: ChatRequestUsage[];
  toolCallsExecuted: number;
  latencyMs: number;
  ok: boolean;
}): string {
  return JSON.stringify({
    event: "chat_turn_usage",
    correlation_id: args.correlationId,
    model: args.model,
    request_count: args.requests.length,
    tool_calls_executed: args.toolCallsExecuted,
    input_tokens: sumMeasured(args.requests.map((r) => r.input_tokens)),
    output_tokens: sumMeasured(args.requests.map((r) => r.output_tokens)),
    cache_read_input_tokens: sumMeasured(args.requests.map((r) => r.cache_read_input_tokens)),
    cache_creation_input_tokens: sumMeasured(args.requests.map((r) => r.cache_creation_input_tokens)),
    latency_ms: args.latencyMs,
    ok: args.ok,
  });
}

/** Sum provider-reported counts. Returns null when any request omitted the field. */
function sumMeasured(values: Array<number | null>): number | null {
  if (values.length === 0 || values.some((value) => value === null)) return null;
  return (values as number[]).reduce((total, value) => total + value, 0);
}

function safeErrorType(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 80) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(trimmed)) return null;
  return trimmed;
}

async function readModelStream(
  response: Response,
  onText: ((text: string) => Promise<void>) | undefined,
  onMessageStart?: () => Promise<void>,
  onToolUseStart?: () => Promise<void>,
  observed?: { assembler: AnthropicMessageAssembler | null },
): Promise<AnthropicMessageAssembler> {
  if (!response.body) throw new Error("empty_body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const sse = new AnthropicSseDecoder();
  const assembler = new AnthropicMessageAssembler();
  if (observed) observed.assembler = assembler;
  let announced = false;

  const apply = async (event: Record<string, unknown>) => {
    if (!announced && event.type === "message_start" && onMessageStart) {
      announced = true;
      try {
        await onMessageStart();
      } catch {
        throw new StreamClientClosed();
      }
    }
    try {
      await assembler.consume(event, onText, onToolUseStart);
    } catch (error) {
      if (error instanceof StreamClientClosed) throw error;
      throw new StreamClientClosed();
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const event of sse.push(chunk)) await apply(event);
    }
    const tail = decoder.decode();
    if (tail) {
      for (const event of sse.push(tail)) await apply(event);
    }
    for (const event of sse.finish()) await apply(event);
    return assembler;
  } catch (error) {
    try {
      await reader.cancel();
    } catch { /* already closed */ }
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch { /* cancel already released the lock */ }
  }
}

function usageFrom(assembler: AnthropicMessageAssembler): UsageSnapshot {
  return assembler.usage ?? emptyUsage();
}

function requestLog(args: {
  correlationId: string;
  model: string;
  stage: ChatRequestStage;
  requestIndex: number;
  usage: UsageSnapshot;
  toolCallsExecuted: number;
  latencyMs: number;
  ok: boolean;
}): ChatRequestUsage {
  return {
    correlation_id: args.correlationId,
    model: args.model,
    stage: args.stage,
    request_index: args.requestIndex,
    input_tokens: args.usage.input_tokens,
    output_tokens: args.usage.output_tokens,
    cache_read_input_tokens: args.usage.cache_read_input_tokens,
    cache_creation_input_tokens: args.usage.cache_creation_input_tokens,
    tool_calls_executed: args.toolCallsExecuted,
    latency_ms: args.latencyMs,
    ok: args.ok,
  };
}

async function executeToolRound(
  toolUses: ToolUseCall[],
  executeToolCall: (call: { name: string; id: string; input: Record<string, unknown> }) => Promise<ToolExecutionResult>,
): Promise<{ results: ToolResultBlock[]; executed: number }> {
  const results: ToolResultBlock[] = [];
  let executed = 0;
  for (const tool of toolUses) {
    if (!tool.id || !tool.name) continue;
    if (!tool.inputValid) {
      results.push({
        type: "tool_result",
        tool_use_id: tool.id,
        content: "Tool input could not be read.",
        is_error: true,
      });
      continue;
    }
    executed += 1;
    try {
      const result = await executeToolCall({
        name: tool.name,
        id: tool.id,
        input: tool.input,
      });
      const block: ToolResultBlock = {
        type: "tool_result",
        tool_use_id: tool.id,
        content: typeof result?.content === "string" ? result.content : "Tool returned no content.",
      };
      if (result?.isError) block.is_error = true;
      results.push(block);
    } catch {
      results.push({
        type: "tool_result",
        tool_use_id: tool.id,
        content: "Tool execution failed.",
        is_error: true,
      });
    }
  }
  return { results, executed };
}

export async function runStreamingChatTurn(args: {
  initialResponse: Response;
  initialStartedAt: number;
  apiKey: string;
  model: string;
  maxTokens: number;
  system: string;
  messages: unknown[];
  toolsEnabled: boolean;
  correlationId: string;
  fetchImpl?: FetchLike;
  onText: (text: string) => Promise<void>;
  onMessageStart?: () => Promise<void>;
  /** Drop text already forwarded from this turn because a tool call has started. */
  onDiscardProvisional?: () => Promise<void>;
  executeToolCall: (call: { name: string; id: string; input: Record<string, unknown> }) => Promise<ToolExecutionResult>;
  log?: (line: string) => void;
  logError?: (line: string) => void;
}): Promise<ChatTurnOutcome> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const log = args.log ?? ((line: string) => console.log(line));
  const logError = args.logError ?? ((line: string) => console.error(line));
  const requests: ChatRequestUsage[] = [];
  const startedAt = args.initialStartedAt;
  let keptText = "";
  let toolUses: ToolUseCall[] = [];
  let toolCallsExecuted = 0;
  let toolStarted = false;
  let forwardedProvisional = "";

  const publish = async (text: string) => {
    keptText += text;
    await args.onText(text);
  };

  const initialOnText = async (text: string) => {
    if (toolStarted) return;
    forwardedProvisional += text;
    await publish(text);
  };

  const onToolUseStart = async () => {
    if (toolStarted) return;
    toolStarted = true;
    const hadProvisional = forwardedProvisional.length > 0;
    forwardedProvisional = "";
    keptText = "";
    if (hadProvisional && args.onDiscardProvisional) await args.onDiscardProvisional();
  };

  const finish = (ok: boolean, continuationFailed = false): ChatTurnOutcome => {
    log(formatTurnSummary({
      correlationId: args.correlationId,
      model: args.model,
      requests,
      toolCallsExecuted,
      latencyMs: Date.now() - startedAt,
      ok,
    }));
    return {
      requestCount: requests.length,
      toolUses,
      assistantText: keptText,
      requests,
      ok,
      continuationFailed,
    };
  };

  const answerObserved: { assembler: AnthropicMessageAssembler | null } = { assembler: null };
  let answer: AnthropicMessageAssembler;
  try {
    answer = await readModelStream(
      args.initialResponse,
      initialOnText,
      args.onMessageStart,
      args.toolsEnabled ? onToolUseStart : undefined,
      answerObserved,
    );
  } catch (error) {
    const latencyMs = Date.now() - args.initialStartedAt;
    const entry = requestLog({
      correlationId: args.correlationId,
      model: args.model,
      stage: "answer",
      requestIndex: 1,
      usage: answerObserved.assembler ? usageFrom(answerObserved.assembler) : emptyUsage(),
      toolCallsExecuted: 0,
      latencyMs,
      ok: false,
    });
    requests.push(entry);
    log(formatChatAnthropicRequest(entry));
    if (error instanceof StreamClientClosed) return finish(false);
    logError(JSON.stringify({
      event: "chat_stream_error",
      correlation_id: args.correlationId,
      stage: "answer",
      latency_ms: latencyMs,
    }));
    return finish(false);
  }

  const answerLatency = Date.now() - args.initialStartedAt;
  const answerOk = !answer.providerErrorType;
  if (answer.providerErrorType) {
    logError(JSON.stringify({
      event: "anthropic_stream_error",
      correlation_id: args.correlationId,
      stage: "answer",
      anthropic_error_type: safeErrorType(answer.providerErrorType),
      elapsed_ms: answerLatency,
    }));
  }

  toolUses = answer.toolUses.filter((tool) => tool.id && tool.name);
  const shouldRunTools = args.toolsEnabled && toolUses.length > 0 && answerOk && answer.content.length > 0;

  if (!shouldRunTools) {
    const entry = requestLog({
      correlationId: args.correlationId,
      model: args.model,
      stage: "answer",
      requestIndex: 1,
      usage: usageFrom(answer),
      toolCallsExecuted: 0,
      latencyMs: answerLatency,
      ok: answerOk,
    });
    requests.push(entry);
    log(formatChatAnthropicRequest(entry));
    return finish(answerOk);
  }

  const toolRound = await executeToolRound(toolUses, args.executeToolCall);
  toolCallsExecuted = toolRound.executed;
  const answerEntry = requestLog({
    correlationId: args.correlationId,
    model: args.model,
    stage: "answer",
    requestIndex: 1,
    usage: usageFrom(answer),
    toolCallsExecuted,
    latencyMs: answerLatency,
    ok: true,
  });
  requests.push(answerEntry);
  log(formatChatAnthropicRequest(answerEntry));

  if (toolRound.results.length === 0 || requests.length >= MAX_MODEL_REQUESTS_PER_TURN) {
    return finish(toolRound.results.length > 0);
  }

  const continuationStarted = Date.now();
  const continuationBody = {
    model: args.model,
    max_tokens: args.maxTokens,
    system: args.system,
    messages: [
      ...args.messages,
      { role: "assistant", content: answer.content },
      { role: "user", content: toolRound.results },
    ],
    stream: true,
  };

  let continuationResponse: Response;
  try {
    continuationResponse = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "x-api-key": args.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(continuationBody),
    });
  } catch {
    const entry = requestLog({
      correlationId: args.correlationId,
      model: args.model,
      stage: "tool_continuation",
      requestIndex: 2,
      usage: emptyUsage(),
      toolCallsExecuted: 0,
      latencyMs: Date.now() - continuationStarted,
      ok: false,
    });
    requests.push(entry);
    log(formatChatAnthropicRequest(entry));
    logError(JSON.stringify({
      event: "chat_stream_error",
      correlation_id: args.correlationId,
      stage: "tool_continuation",
      latency_ms: Date.now() - continuationStarted,
    }));
    return finish(false, true);
  }

  if (!continuationResponse.ok) {
    const latencyMs = Date.now() - continuationStarted;
    if (continuationResponse.status !== 429) {
      const errorType = await readAnthropicErrorType(continuationResponse);
      logError(formatAnthropicHttpErrorLog({
        http_status: continuationResponse.status,
        anthropic_error_type: errorType,
        elapsed_ms: latencyMs,
        stage: "tool_continuation",
        request_id: args.correlationId,
      }));
    } else {
      logError(formatAnthropicHttpErrorLog({
        http_status: 429,
        anthropic_error_type: null,
        elapsed_ms: latencyMs,
        stage: "tool_continuation",
        request_id: args.correlationId,
      }));
    }
    const entry = requestLog({
      correlationId: args.correlationId,
      model: args.model,
      stage: "tool_continuation",
      requestIndex: 2,
      usage: emptyUsage(),
      toolCallsExecuted: 0,
      latencyMs,
      ok: false,
    });
    requests.push(entry);
    log(formatChatAnthropicRequest(entry));
    return finish(false, true);
  }

  const continuationObserved: { assembler: AnthropicMessageAssembler | null } = { assembler: null };
  let continuation: AnthropicMessageAssembler;
  try {
    continuation = await readModelStream(continuationResponse, publish, undefined, undefined, continuationObserved);
  } catch (error) {
    const entry = requestLog({
      correlationId: args.correlationId,
      model: args.model,
      stage: "tool_continuation",
      requestIndex: 2,
      usage: continuationObserved.assembler ? usageFrom(continuationObserved.assembler) : emptyUsage(),
      toolCallsExecuted: 0,
      latencyMs: Date.now() - continuationStarted,
      ok: false,
    });
    requests.push(entry);
    log(formatChatAnthropicRequest(entry));
    if (error instanceof StreamClientClosed) return finish(false, false);
    logError(JSON.stringify({
      event: "chat_stream_error",
      correlation_id: args.correlationId,
      stage: "tool_continuation",
      latency_ms: Date.now() - continuationStarted,
    }));
    return finish(false, true);
  }

  // Continuation is the final answer. Ignore any further tool blocks so a
  // model that still emits tool_use cannot start another request.
  if (continuation.toolUses.length > 0) {
    logError(JSON.stringify({
      event: "chat_tool_round_capped",
      correlation_id: args.correlationId,
      stage: "tool_continuation",
      tool_blocks: continuation.toolUses.length,
    }));
  }

  const continuationOk = !continuation.providerErrorType;
  if (continuation.providerErrorType) {
    logError(JSON.stringify({
      event: "anthropic_stream_error",
      correlation_id: args.correlationId,
      stage: "tool_continuation",
      anthropic_error_type: safeErrorType(continuation.providerErrorType),
      elapsed_ms: Date.now() - continuationStarted,
    }));
  }

  const continuationEntry = requestLog({
    correlationId: args.correlationId,
    model: args.model,
    stage: "tool_continuation",
    requestIndex: 2,
    usage: usageFrom(continuation),
    toolCallsExecuted: 0,
    latencyMs: Date.now() - continuationStarted,
    ok: continuationOk,
  });
  requests.push(continuationEntry);
  log(formatChatAnthropicRequest(continuationEntry));
  return finish(continuationOk, !continuationOk);
}
