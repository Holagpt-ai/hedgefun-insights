import { describe, expect, it } from "vitest";
import { interpretChatSseData } from "./chat";

describe("interpretChatSseData", () => {
  it("keeps ordinary deltas and completion", () => {
    expect(interpretChatSseData(JSON.stringify({
      choices: [{ delta: { content: "Apple (AAPL)" } }],
    }))).toEqual({ kind: "delta", text: "Apple (AAPL)" });
    expect(interpretChatSseData("[DONE]")).toEqual({ kind: "done" });
    expect(interpretChatSseData(JSON.stringify({ type: "conversation_id", id: "conv-1" }))).toEqual({
      kind: "conversation",
      id: "conv-1",
    });
  });

  it("drops provisional tool text and surfaces continuation failure", () => {
    expect(interpretChatSseData(JSON.stringify({ type: "reset_assistant" }))).toEqual({ kind: "reset" });
    expect(interpretChatSseData(JSON.stringify({ error: "AI service error" }))).toEqual({
      kind: "error",
      error: "AI service error",
    });
  });

  it("does not treat a broken frame as answer text", () => {
    expect(interpretChatSseData("{not-json")).toEqual({ kind: "malformed" });
  });
});
