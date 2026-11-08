import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { OllamaClient } from "../../../src/agent/clients/ollama-client";
import { Message, ToolCall, ToolResult } from "../../../src/agent/models/agent";
import {
  type ConversationTurn,
  LlmRequest,
} from "../../../src/agent/models/llm";
import { CalculatorTool } from "../../../src/tools";

const instruction = "You are a helpful assistant.";
const tools = [new CalculatorTool()];

function turn(
  author: string,
  ...items: ConversationTurn["items"]
): ConversationTurn {
  return { author, items };
}

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
// biome-ignore lint/suspicious/noExplicitAny: request bodies are asserted against plain JSON
let requests: { url: string; body: any; headers: Headers }[];

/** Queues the bodies Ollama returns, in order, one per fetch call. */
function mockOllama(...responses: Response[]) {
  fetchSpy.mockImplementation((async (url: string, init?: RequestInit) => {
    requests.push({
      url,
      body: JSON.parse(init?.body as string),
      headers: new Headers(init?.headers),
    });
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

function toolCallResponse(...expressions: string[]) {
  return Response.json({
    message: {
      content: "",
      tool_calls: expressions.map((expression) => ({
        function: { name: "calculator", arguments: { expression } },
      })),
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
  test("sends bearer authentication to Ollama Cloud", async () => {
    mockOllama(textResponse("Hello!"));
    const client = new OllamaClient(
      "glm-5.3",
      1,
      "https://ollama.com",
      "cloud-key",
    );

    await client.generate(new LlmRequest(instruction, tools, []));

    expect(requests[0]?.url).toBe("https://ollama.com/api/chat");
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer cloud-key");
  });

  test("sends the instruction, messages, and tools to /api/chat", async () => {
    mockOllama(textResponse("Hello!"));
    const client = new OllamaClient("test-model", 0.2, "localhost:11434/");

    await client.generate(
      new LlmRequest(instruction, tools, [
        turn("user", new Message("user", "Hi")),
      ]),
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
      new LlmRequest(instruction, tools, [
        turn("user", new Message("user", "Hi")),
      ]),
    );

    expect(response.error).toBe("");
    expect(response.data).toBeInstanceOf(Message);
    expect((response.data as Message).content).toBe("Hello!");
    expect(response.metadata.prompt_tokens).toBe(12);
    expect(response.metadata.completion_tokens).toBe(5);
    expect(response.metadata.response_id).toBeString();
  });

  test("returns a tool call as an array", async () => {
    mockOllama(toolCallResponse("2 + 2"));
    const client = new OllamaClient("test-model");

    const response = await client.generate(
      new LlmRequest(instruction, tools, [
        turn("user", new Message("user", "2 + 2?")),
      ]),
    );

    const toolCalls = response.data as ToolCall[];
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toBeInstanceOf(ToolCall);
    expect(toolCalls[0]?.name).toBe("calculator");
    expect(toolCalls[0]?.arguments).toEqual({ expression: "2 + 2" });
    expect(toolCalls[0]?.call_id).toBeString();
  });

  test("returns every tool call with a unique call id", async () => {
    mockOllama(toolCallResponse("2 + 2", "3 * 3"));
    const client = new OllamaClient("test-model");

    const response = await client.generate(
      new LlmRequest(instruction, tools, [
        turn("user", new Message("user", "Both?")),
      ]),
    );

    const toolCalls = response.data as ToolCall[];
    expect(toolCalls.map((toolCall) => toolCall.arguments)).toEqual([
      { expression: "2 + 2" },
      { expression: "3 * 3" },
    ]);
    expect(new Set(toolCalls.map((toolCall) => toolCall.call_id)).size).toBe(2);
  });

  test("continues the conversation with every tool result", async () => {
    mockOllama(toolCallResponse("2 + 2", "3 * 3"), textResponse("4 and 9."));
    const client = new OllamaClient("test-model");
    const userTurn = turn("user", new Message("user", "Both?"));

    const first = await client.generate(
      new LlmRequest(instruction, tools, [userTurn]),
    );
    const [sum, product] = first.data as ToolCall[];
    const second = await client.generate(
      new LlmRequest(instruction, tools, [
        userTurn,
        turn("assistant", sum as ToolCall, product as ToolCall),
        turn(
          "tool",
          new ToolResult(sum?.call_id as string, false, 4),
          new ToolResult(product?.call_id as string, false, 9),
        ),
      ]),
    );

    expect(requests[1]?.body.messages).toEqual([
      { role: "system", content: instruction },
      { role: "user", content: "Both?" },
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
          {
            function: {
              name: "calculator",
              arguments: { expression: "3 * 3" },
            },
          },
        ],
      },
      {
        role: "tool",
        tool_name: "calculator",
        content: JSON.stringify({ failed: false, response: 4 }),
      },
      {
        role: "tool",
        tool_name: "calculator",
        content: JSON.stringify({ failed: false, response: 9 }),
      },
    ]);
    expect((second.data as Message).content).toBe("4 and 9.");
  });

  test("can replay complete history without client-side conversation state", async () => {
    mockOllama(
      toolCallResponse("2 + 2"),
      textResponse("2 + 2 is 4."),
      textResponse("2 + 2 is 4."),
    );
    const client = new OllamaClient("test-model");
    const userTurn = turn("user", new Message("user", "2 + 2?"));
    const first = await client.generate(
      new LlmRequest(instruction, tools, [userTurn]),
    );
    const [toolCall] = first.data as ToolCall[];
    const followUp = new LlmRequest(instruction, tools, [
      userTurn,
      turn("assistant", toolCall as ToolCall),
      turn("tool", new ToolResult(toolCall?.call_id as string, false, 4)),
    ]);

    const firstFollowUp = await client.generate(followUp);
    const replay = await client.generate(followUp);

    expect(firstFollowUp.error).toBe("");
    expect(replay.error).toBe("");
    expect(requests[1]?.body.messages).toEqual(requests[2]?.body.messages);
  });

  test("returns an error for a result without a matching tool call", async () => {
    mockOllama();
    const client = new OllamaClient("test-model");

    const response = await client.generate(
      new LlmRequest(instruction, tools, [
        turn("tool", new ToolResult("call-1", false, 4)),
      ]),
    );

    expect(response.error).toBe(
      "Ollama request failed: No tool call found for result call-1.",
    );
    expect(requests).toHaveLength(0);
  });

  test("returns an error when Ollama responds with a failure status", async () => {
    mockOllama(new Response("model not found", { status: 404 }));
    const client = new OllamaClient("missing-model");

    const response = await client.generate(
      new LlmRequest(instruction, tools, [
        turn("user", new Message("user", "Hi")),
      ]),
    );

    expect(response.error).toBe(
      "Ollama request failed: Ollama returned 404: model not found",
    );
    expect(response.data).toBeInstanceOf(Message);
  });
});
