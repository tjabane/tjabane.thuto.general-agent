import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { OpenAIClient } from "../../../src/agent/clients/openai-client";
import {
  Message,
  ToolCall,
  ToolResult,
} from "../../../src/agent/models/agent";
import { LlmRequest } from "../../../src/agent/models/llm";
import { CalculatorTool } from "../../../src/tools";

const instruction = "You are a helpful assistant.";
const tools = [new CalculatorTool()];
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
let errorSpy: ReturnType<typeof spyOn<typeof console, "error">>;
let originalApiKey: string | undefined;
let originalBaseUrl: string | undefined;
let requests: { url: string; body: Record<string, unknown> }[];

function mockResponses(...responses: Response[]) {
  fetchSpy.mockImplementation((async (url: string, init?: RequestInit) => {
    requests.push({ url: String(url), body: JSON.parse(init?.body as string) });
    const response = responses.shift();
    if (!response) throw new Error("Unexpected fetch call.");
    return response;
  }) as typeof fetch);
}

function apiResponse(output: object[], id = "resp-1") {
  return Response.json({
    id,
    object: "response",
    status: "completed",
    output,
    usage: { input_tokens: 12, output_tokens: 5, total_tokens: 17 },
  });
}

function textOutput(text: string) {
  return {
    type: "message",
    id: "msg-1",
    status: "completed",
    role: "assistant",
    content: [{ type: "output_text", text, annotations: [] }],
  };
}

function functionOutput(callId: string, args: string) {
  return {
    type: "function_call",
    id: `fc-${callId}`,
    status: "completed",
    call_id: callId,
    name: "calculator",
    arguments: args,
  };
}

beforeEach(() => {
  originalApiKey = process.env.OPENAI_API_KEY;
  originalBaseUrl = process.env.OPENAI_BASE_URL;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_BASE_URL = "https://openai.test/v1";
  requests = [];
  fetchSpy = spyOn(globalThis, "fetch");
  errorSpy = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  fetchSpy.mockRestore();
  errorSpy.mockRestore();
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalApiKey;
  if (originalBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
  else process.env.OPENAI_BASE_URL = originalBaseUrl;
});

describe("OpenAIClient", () => {
  test("sends messages, instructions, and strict tools to the Responses API", async () => {
    mockResponses(apiResponse([textOutput("Hello!")]));
    const client = new OpenAIClient("test-model", 0.2);
    await client.generate(
      new LlmRequest(instruction, tools, [new Message("user", "Hi")]),
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://openai.test/v1/responses");
    expect(requests[0]?.body).toEqual({
      model: "test-model",
      instructions: instruction,
      tools: tools.map((tool) => ({
        type: "function",
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        strict: true,
      })),
      parallel_tool_calls: true,
      input: [{ type: "message", role: "user", content: "Hi" }],
      temperature: 0.2,
    });
  });

  test("returns assistant text and response usage metadata", async () => {
    mockResponses(apiResponse([textOutput("Hello!")]));
    const response = await new OpenAIClient("test-model").generate(
      new LlmRequest(instruction, [], []),
    );
    expect(response.error).toBe("");
    expect(response.data).toBeInstanceOf(Message);
    expect(response.data).toEqual(new Message("assistant", "Hello!"));
    expect(response.metadata).toEqual({
      total_tokens: 17,
      response_id: "resp-1",
    });
  });

  test("returns every function call with parsed arguments and original call ids", async () => {
    mockResponses(
      apiResponse([
        textOutput("Calculating both."),
        functionOutput("call-1", '{"expression":"2+2"}'),
        functionOutput("call-2", '{"expression":"3*3"}'),
      ]),
    );
    const response = await new OpenAIClient("test-model").generate(
      new LlmRequest(instruction, tools, []),
    );
    expect(response.error).toBe("");
    expect(response.data).toEqual([
      new ToolCall("calculator", "call-1", { expression: "2+2" }),
      new ToolCall("calculator", "call-2", { expression: "3*3" }),
    ]);
  });

  test("chains all tool results, including failures, without resending messages", async () => {
    mockResponses(apiResponse([textOutput("Done.")], "resp-2"));
    const response = await new OpenAIClient("test-model").generate(
      new LlmRequest(
        instruction,
        tools,
        [new Message("user", "Calculate both")],
        [
          new ToolResult("call-1", false, 4),
          new ToolResult("call-2", true, "Division by zero"),
        ],
        "resp-1",
      ),
    );
    expect(requests[0]?.body.previous_response_id).toBe("resp-1");
    expect(requests[0]?.body.input).toEqual([
      {
        type: "function_call_output",
        call_id: "call-1",
        output: JSON.stringify({ failed: false, response: 4 }),
      },
      {
        type: "function_call_output",
        call_id: "call-2",
        output: JSON.stringify({ failed: true, response: "Division by zero" }),
      },
    ]);
    expect(response.metadata.response_id).toBe("resp-2");
    expect(response.data).toEqual(new Message("assistant", "Done."));
  });

  test("surfaces API errors as failed LLM responses", async () => {
    mockResponses(
      Response.json(
        {
          error: { message: "Invalid API key", type: "invalid_request_error" },
        },
        { status: 401 },
      ),
    );
    const response = await new OpenAIClient("test-model").generate(
      new LlmRequest(instruction, [], []),
    );
    expect(response.error).toContain("Invalid API key");
    expect(response.data).toEqual(new Message("assistant", ""));
    expect(response.metadata).toEqual({});
    expect(requests).toHaveLength(1);
  });

  test("returns an error when function arguments are malformed JSON", async () => {
    mockResponses(apiResponse([functionOutput("call-1", "not JSON")]));
    const response = await new OpenAIClient("test-model").generate(
      new LlmRequest(instruction, tools, []),
    );
    expect(response.error).not.toBe("");
    expect(response.data).toEqual(new Message("assistant", ""));
    expect(response.metadata).toEqual({});
  });
});
