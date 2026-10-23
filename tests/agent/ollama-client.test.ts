import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { OllamaClient } from "../../src/agent/clients/ollama-client";
import { Message, ToolCall, ToolResult } from "../../src/agent/models/agent";
import { LlmRequest } from "../../src/agent/models/llm";
import { CalculatorTool } from "../../src/tools";

const instruction = "You are a helpful assistant.";
const tools = [new CalculatorTool()];

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
// biome-ignore lint/suspicious/noExplicitAny: request bodies are asserted against plain JSON
let requests: { url: string; body: any }[];

/** Queues the bodies Ollama returns, in order, one per fetch call. */
function mockOllama(...responses: Response[]) {
  fetchSpy.mockImplementation((async (url: string, init?: RequestInit) => {
    requests.push({ url, body: JSON.parse(init?.body as string) });
    const response = responses.shift();
    if (!response) {
      throw new Error("Unexpected fetch call.");
    }
    return response;
  }) as typeof fetch);
}

function textResponse(content: string) {
  return Response.json({
    message: { content },
    prompt_eval_count: 12,
    eval_count: 5,
  });
}

function toolCallResponse(name: string, args: Record<string, unknown>) {
  return Response.json({
    message: {
      content: "",
      tool_calls: [{ function: { name, arguments: args } }],
    },
  });
}

beforeEach(() => {
  requests = [];
  fetchSpy = spyOn(globalThis, "fetch");
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("OllamaClient", () => {
  test("sends the instruction, messages, and tools to /api/chat", async () => {
    mockOllama(textResponse("Hello!"));
    const client = new OllamaClient("test-model", 0.2, "localhost:11434/");

    await client.generate(
      new LlmRequest(instruction, tools, [new Message("user", "Hi")]),
    );

    expect(requests[0]?.url).toBe("http://localhost:11434/api/chat");
    expect(requests[0]?.body).toEqual({
      model: "test-model",
      stream: false,
      messages: [
        { role: "system", content: instruction },
        { role: "user", content: "Hi" },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "calculator",
            description: tools[0]?.description,
            parameters: tools[0]?.parameters,
          },
        },
      ],
      options: { temperature: 0.2 },
    });
  });

  test("returns a message with token usage", async () => {
    mockOllama(textResponse("Hello!"));
    const client = new OllamaClient("test-model");

    const response = await client.generate(
      new LlmRequest(instruction, tools, [new Message("user", "Hi")]),
    );

    expect(response.error).toBe("");
    expect(response.data).toBeInstanceOf(Message);
    expect((response.data as Message).content).toBe("Hello!");
    expect(response.metadata.prompt_tokens).toBe(12);
    expect(response.metadata.completion_tokens).toBe(5);
    expect(response.metadata.response_id).toBeString();
  });

  test("returns a tool call", async () => {
    mockOllama(toolCallResponse("calculator", { expression: "2 + 2" }));
    const client = new OllamaClient("test-model");

    const response = await client.generate(
      new LlmRequest(instruction, tools, [new Message("user", "2 + 2?")]),
    );

    expect(response.data).toBeInstanceOf(ToolCall);
    const toolCall = response.data as ToolCall;
    expect(toolCall.name).toBe("calculator");
    expect(toolCall.arguments).toEqual({ expression: "2 + 2" });
    expect(toolCall.call_id).toBeString();
  });

  test("continues the conversation with tool results", async () => {
    mockOllama(
      toolCallResponse("calculator", { expression: "2 + 2" }),
      textResponse("2 + 2 is 4."),
    );
    const client = new OllamaClient("test-model");
    const messages = [new Message("user", "2 + 2?")];

    const first = await client.generate(
      new LlmRequest(instruction, tools, messages),
    );
    const toolCall = first.data as ToolCall;
    const second = await client.generate(
      new LlmRequest(
        instruction,
        tools,
        messages,
        [new ToolResult(toolCall.call_id, false, 4)],
        first.metadata.response_id,
      ),
    );

    expect(requests[1]?.body.messages).toEqual([
      { role: "system", content: instruction },
      { role: "user", content: "2 + 2?" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            function: {
              name: "calculator",
              arguments: { expression: "2 + 2" },
            },
          },
        ],
      },
      {
        role: "tool",
        tool_name: "calculator",
        content: JSON.stringify({ failed: false, response: 4 }),
      },
    ]);
    expect((second.data as Message).content).toBe("2 + 2 is 4.");
  });

  test("forgets a conversation once its tool results are sent", async () => {
    mockOllama(
      toolCallResponse("calculator", { expression: "2 + 2" }),
      textResponse("2 + 2 is 4."),
    );
    const client = new OllamaClient("test-model");
    const messages = [new Message("user", "2 + 2?")];
    const first = await client.generate(
      new LlmRequest(instruction, tools, messages),
    );
    const followUp = new LlmRequest(
      instruction,
      tools,
      messages,
      [new ToolResult((first.data as ToolCall).call_id, false, 4)],
      first.metadata.response_id,
    );

    await client.generate(followUp);
    const replay = await client.generate(followUp);

    expect(replay.error).toContain(
      `No conversation found for response ${first.metadata.response_id}.`,
    );
    expect(requests).toHaveLength(2);
  });

  test("returns an error for tool results without a known conversation", async () => {
    mockOllama();
    const client = new OllamaClient("test-model");

    const response = await client.generate(
      new LlmRequest(
        instruction,
        tools,
        [],
        [new ToolResult("call-1", false, 4)],
        "unknown-response",
      ),
    );

    expect(response.error).toBe(
      "Ollama request failed: No conversation found for response unknown-response.",
    );
    expect(requests).toHaveLength(0);
  });

  test("returns an error when Ollama responds with a failure status", async () => {
    mockOllama(new Response("model not found", { status: 404 }));
    const client = new OllamaClient("missing-model");

    const response = await client.generate(
      new LlmRequest(instruction, tools, [new Message("user", "Hi")]),
    );

    expect(response.error).toBe(
      "Ollama request failed: Ollama returned 404: model not found",
    );
    expect(response.data).toBeInstanceOf(Message);
  });
});
