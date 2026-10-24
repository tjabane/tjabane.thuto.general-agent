import { describe, expect, test } from "bun:test";
import { Agent } from "../../src/agent/agent";
import { Message, ToolCall, ToolResult } from "../../src/agent/models/agent";
import { LLMResponse } from "../../src/agent/models/llm";
import { ScriptedLLMClient } from "./support/scripted-llm-client";
import { TestTool } from "./support/test-tool";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("Agent direct task completion", () => {
  test("when a task can be answered directly, returns the answer", async () => {
    const client = new ScriptedLLMClient([
      new LLMResponse(new Message("assistant", "Hello!"), {}),
    ]);
    const agent = new Agent(client, "You are a helpful assistant.", []);

    const result = await agent.run("Hi");

    expect(result.response).toBe("Hello!");
    expect(result.context.result).toBe("Hello!");
    expect(result.context.iteration).toBe(1);

    expect(client.requests).toHaveLength(1);
    expect(client.requests[0]).toEqual({
      instruction: "You are a helpful assistant.",
      tools: [],
      messages: [new Message("user", "Hi")],
      toolResults: [],
      previousResponseId: undefined,
    });

    expect(result.context.events).toHaveLength(2);
    expect(result.context.events[0]).toMatchObject({
      runId: result.context.runId,
      author: "user",
      content: new Message("user", "Hi"),
    });
    expect(result.context.events[1]).toMatchObject({
      runId: result.context.runId,
      author: "assistant",
      content: new Message("assistant", "Hello!"),
    });
  });
});

describe("Agent single-tool task completion", () => {
  test("when a task requires a tool, uses the tool result to complete the task", async () => {
    const tool = new TestTool<{ text: string }, string>(
      "echo",
      (_context, { text }) => text,
    );
    const requestedToolCall = new ToolCall("echo", "call-1", {
      text: "Hello from the tool!",
    });
    const client = new ScriptedLLMClient([
      new LLMResponse([requestedToolCall], { response_id: "response-1" }),
      new LLMResponse(new Message("assistant", "Tool complete."), {}),
    ]);
    const agent = new Agent(client, "Use tools when needed.", [tool]);

    const result = await agent.run("Use the echo tool");

    expect(result.response).toBe("Tool complete.");
    expect(result.context.iteration).toBe(2);
    expect(
      tool.executions.map(({ context, input }) => ({
        runId: context.runId,
        arguments: input,
      })),
    ).toEqual([
      {
        runId: result.context.runId,
        arguments: { text: "Hello from the tool!" },
      },
    ]);

    expect(client.requests).toHaveLength(2);
    expect(client.requests[0]?.tools).toEqual([tool]);
    expect(client.requests[1]?.previousResponseId).toBe("response-1");
    expect(client.requests[1]?.toolResults).toEqual([
      new ToolResult("call-1", false, "Hello from the tool!"),
    ]);

    expect(
      result.context.events.map(({ author, content }) => ({ author, content })),
    ).toEqual([
      { author: "user", content: new Message("user", "Use the echo tool") },
      { author: "assistant", content: [requestedToolCall] },
      {
        author: "tool_result",
        content: new ToolResult("call-1", false, "Hello from the tool!"),
      },
      {
        author: "assistant",
        content: new Message("assistant", "Tool complete."),
      },
    ]);
  });

  test("when a requested tool is unavailable, lets the model respond to the failure", async () => {
    const requestedToolCall = new ToolCall("missing_tool", "call-1", {
      value: "test",
    });
    const client = new ScriptedLLMClient([
      new LLMResponse([requestedToolCall], { response_id: "response-1" }),
      new LLMResponse(
        new Message("assistant", "The requested tool is unavailable."),
        {},
      ),
    ]);
    const agent = new Agent(client, "Use tools when needed.", []);

    const result = await agent.run("Use a missing tool");

    expect(result.response).toBe("The requested tool is unavailable.");
    expect(result.context.iteration).toBe(2);
    expect(client.requests).toHaveLength(2);
    expect(client.requests[1]?.previousResponseId).toBe("response-1");
    expect(client.requests[1]?.toolResults[0]).toMatchObject({
      call_id: "call-1",
      failed: true,
    });
    expect(client.requests[1]?.toolResults[0]?.response).toContain(
      "missing_tool",
    );

    const toolResultEvent = result.context.events.find(
      ({ author }) => author === "tool_result",
    );
    expect(toolResultEvent?.content).toMatchObject({
      call_id: "call-1",
      failed: true,
    });
  });

  test("when a requested tool fails, lets the model respond to the failure", async () => {
    const tool = new TestTool<{ text: string }, string>("echo", async () => {
      throw new Error("Echo service unavailable");
    });
    const requestedToolCall = new ToolCall("echo", "call-1", {
      text: "Hello from the tool!",
    });
    const client = new ScriptedLLMClient([
      new LLMResponse([requestedToolCall], { response_id: "response-1" }),
      new LLMResponse(new Message("assistant", "The echo tool failed."), {}),
    ]);
    const agent = new Agent(client, "Use tools when needed.", [tool]);

    const result = await agent.run("Use the echo tool");

    expect(result.response).toBe("The echo tool failed.");
    expect(result.context.iteration).toBe(2);
    expect(tool.executions).toHaveLength(1);
    expect(client.requests).toHaveLength(2);
    expect(client.requests[1]?.previousResponseId).toBe("response-1");
    expect(client.requests[1]?.toolResults[0]).toMatchObject({
      call_id: "call-1",
      failed: true,
    });
    expect(client.requests[1]?.toolResults[0]?.response).toContain(
      "Echo service unavailable",
    );

    const toolResultEvent = result.context.events.find(
      ({ author }) => author === "tool_result",
    );
    expect(toolResultEvent?.content).toMatchObject({
      call_id: "call-1",
      failed: true,
    });
  });
});

describe("Agent multiple-tool task completion", () => {
  test("when a task requires multiple tools, uses all tool results to complete the task", async () => {
    const uppercaseTool = new TestTool<{ text: string }, string>(
      "uppercase",
      (_context, { text }) => text.toUpperCase(),
    );
    const lengthTool = new TestTool<{ text: string }, number>(
      "length",
      (_context, { text }) => text.length,
    );
    const uppercaseCall = new ToolCall("uppercase", "call-1", {
      text: "hello",
    });
    const lengthCall = new ToolCall("length", "call-2", { text: "hello" });
    const client = new ScriptedLLMClient([
      new LLMResponse([uppercaseCall, lengthCall], {
        response_id: "response-1",
      }),
      new LLMResponse(
        new Message("assistant", "HELLO contains 5 characters."),
        {},
      ),
    ]);
    const agent = new Agent(client, "Use tools when needed.", [
      uppercaseTool,
      lengthTool,
    ]);

    const result = await agent.run("Uppercase hello and count its characters");

    expect(result.response).toBe("HELLO contains 5 characters.");
    expect(result.context.iteration).toBe(2);
    expect(uppercaseTool.executions).toHaveLength(1);
    expect(lengthTool.executions).toHaveLength(1);
    expect(client.requests).toHaveLength(2);
    expect(client.requests[1]?.previousResponseId).toBe("response-1");
    expect(client.requests[1]?.toolResults).toEqual([
      new ToolResult("call-1", false, "HELLO"),
      new ToolResult("call-2", false, 5),
    ]);
    expect(
      result.context.events
        .filter(({ author }) => author === "tool_result")
        .map(({ content }) => content),
    ).toEqual([
      new ToolResult("call-1", false, "HELLO"),
      new ToolResult("call-2", false, 5),
    ]);
  });

  test("when multiple independent tools are requested, executes them concurrently", async () => {
    const firstStarted = deferred();
    const releaseFirst = deferred();
    const releaseSecond = deferred();
    const started: string[] = [];
    const firstTool = new TestTool("first", async () => {
      started.push("first");
      firstStarted.resolve();
      await releaseFirst.promise;
      return "first result";
    });
    const secondTool = new TestTool("second", async () => {
      started.push("second");
      await releaseSecond.promise;
      return "second result";
    });
    const client = new ScriptedLLMClient([
      new LLMResponse(
        [
          new ToolCall("first", "call-1", {}),
          new ToolCall("second", "call-2", {}),
        ],
        { response_id: "response-1" },
      ),
      new LLMResponse(new Message("assistant", "Both tools completed."), {}),
    ]);
    const agent = new Agent(client, "Use tools when needed.", [
      firstTool,
      secondTool,
    ]);

    const run = agent.run("Run both independent operations");
    await firstStarted.promise;
    const startedBeforeEitherFinished = started.toSorted();

    releaseFirst.resolve();
    releaseSecond.resolve();
    const result = await run;

    expect(startedBeforeEitherFinished).toEqual(["first", "second"]);
    expect(result.response).toBe("Both tools completed.");
    expect(client.requests[1]?.toolResults).toEqual([
      new ToolResult("call-1", false, "first result"),
      new ToolResult("call-2", false, "second result"),
    ]);
  });

  test("when one of multiple requested tools fails, returns both successful and failed results", async () => {
    const successfulTool = new TestTool("successful", () => "completed");
    const failingTool = new TestTool("failing", async () => {
      throw new Error("Tool operation failed");
    });
    const client = new ScriptedLLMClient([
      new LLMResponse(
        [
          new ToolCall("successful", "call-1", {}),
          new ToolCall("failing", "call-2", {}),
        ],
        { response_id: "response-1" },
      ),
      new LLMResponse(
        new Message("assistant", "One operation completed and one failed."),
        {},
      ),
    ]);
    const agent = new Agent(client, "Use tools when needed.", [
      successfulTool,
      failingTool,
    ]);

    const result = await agent.run("Run both operations");

    expect(result.response).toBe("One operation completed and one failed.");
    expect(client.requests[1]?.toolResults[0]).toEqual(
      new ToolResult("call-1", false, "completed"),
    );
    expect(client.requests[1]?.toolResults[1]).toMatchObject({
      call_id: "call-2",
      failed: true,
    });
    expect(client.requests[1]?.toolResults[1]?.response).toContain(
      "Tool operation failed",
    );
  });
});

describe("Agent sequential tool rounds", () => {
  test("when a task requires sequential tool rounds, uses each result before continuing", async () => {
    const tool = new TestTool<{ step: string }, string>(
      "step",
      (_context, { step }) => `${step} complete`,
    );
    const client = new ScriptedLLMClient([
      new LLMResponse([new ToolCall("step", "call-1", { step: "first" })], {
        response_id: "response-1",
      }),
      new LLMResponse([new ToolCall("step", "call-2", { step: "second" })], {
        response_id: "response-2",
      }),
      new LLMResponse(new Message("assistant", "Both steps complete."), {}),
    ]);
    const agent = new Agent(client, "Use tools when needed.", [tool]);

    const result = await agent.run("Complete both steps in order");

    expect(result.response).toBe("Both steps complete.");
    expect(tool.executions.map(({ input }) => input.step)).toEqual([
      "first",
      "second",
    ]);
    expect(client.requests).toHaveLength(3);
    expect(client.requests[1]?.previousResponseId).toBe("response-1");
    expect(client.requests[1]?.toolResults).toEqual([
      new ToolResult("call-1", false, "first complete"),
    ]);
    expect(client.requests[2]?.previousResponseId).toBe("response-2");
    expect(client.requests[2]?.toolResults).toEqual([
      new ToolResult("call-2", false, "second complete"),
    ]);
  });
});

describe("Agent tool-result integrity", () => {
  test("when the same tool is requested more than once, preserves each call and result", async () => {
    const tool = new TestTool<{ value: number }, number>(
      "double",
      (_context, { value }) => value * 2,
    );
    const client = new ScriptedLLMClient([
      new LLMResponse(
        [
          new ToolCall("double", "call-1", { value: 2 }),
          new ToolCall("double", "call-2", { value: 5 }),
        ],
        { response_id: "response-1" },
      ),
      new LLMResponse(
        new Message("assistant", "The results are 4 and 10."),
        {},
      ),
    ]);
    const agent = new Agent(client, "Use tools when needed.", [tool]);

    const result = await agent.run("Double 2 and 5");

    expect(result.response).toBe("The results are 4 and 10.");
    expect(tool.executions.map(({ input }) => input.value)).toEqual([2, 5]);
    expect(client.requests[1]?.toolResults).toEqual([
      new ToolResult("call-1", false, 4),
      new ToolResult("call-2", false, 10),
    ]);
  });

  test("when tools return falsy values, preserves them as successful results", async () => {
    const tool = new TestTool<{ value: unknown }, unknown>(
      "identity",
      (_context, { value }) => value,
    );
    const client = new ScriptedLLMClient([
      new LLMResponse(
        [
          new ToolCall("identity", "call-1", { value: 0 }),
          new ToolCall("identity", "call-2", { value: false }),
          new ToolCall("identity", "call-3", { value: "" }),
        ],
        { response_id: "response-1" },
      ),
      new LLMResponse(new Message("assistant", "Falsy values preserved."), {}),
    ]);
    const agent = new Agent(client, "Use tools when needed.", [tool]);

    const result = await agent.run("Return several falsy values");

    expect(result.response).toBe("Falsy values preserved.");
    expect(client.requests[1]?.toolResults).toEqual([
      new ToolResult("call-1", false, 0),
      new ToolResult("call-2", false, false),
      new ToolResult("call-3", false, ""),
    ]);
  });

  test("when a tool returns structured data, preserves the complete result", async () => {
    const structuredResult = {
      items: ["alpha", "beta"],
      metadata: { count: 2 },
    };
    const tool = new TestTool("structured", () => structuredResult);
    const client = new ScriptedLLMClient([
      new LLMResponse([new ToolCall("structured", "call-1", {})], {
        response_id: "response-1",
      }),
      new LLMResponse(new Message("assistant", "Found two items."), {}),
    ]);
    const agent = new Agent(client, "Use tools when needed.", [tool]);

    const result = await agent.run("Get the structured data");

    expect(result.response).toBe("Found two items.");
    expect(client.requests[1]?.toolResults).toEqual([
      new ToolResult("call-1", false, structuredResult),
    ]);
  });

  test("when concurrent tools finish out of order, records results in request order", async () => {
    const firstStarted = deferred();
    const secondFinished = deferred();
    const releaseFirst = deferred();
    const firstTool = new TestTool("first", async () => {
      firstStarted.resolve();
      await releaseFirst.promise;
      return "first result";
    });
    const secondTool = new TestTool("second", () => {
      secondFinished.resolve();
      return "second result";
    });
    const client = new ScriptedLLMClient([
      new LLMResponse(
        [
          new ToolCall("first", "call-1", {}),
          new ToolCall("second", "call-2", {}),
        ],
        { response_id: "response-1" },
      ),
      new LLMResponse(new Message("assistant", "Both tools completed."), {}),
    ]);
    const agent = new Agent(client, "Use tools when needed.", [
      firstTool,
      secondTool,
    ]);

    const run = agent.run("Run both operations");
    await firstStarted.promise;
    await secondFinished.promise;
    releaseFirst.resolve();
    const result = await run;

    expect(result.response).toBe("Both tools completed.");
    expect(
      result.context.events
        .filter(({ author }) => author === "tool_result")
        .map(({ content }) => content),
    ).toEqual([
      new ToolResult("call-1", false, "first result"),
      new ToolResult("call-2", false, "second result"),
    ]);
  });
});

describe("Agent model-response handling", () => {
  test("when the model returns an error, rejects the failed response", async () => {
    const client = new ScriptedLLMClient([
      new LLMResponse(new Message("assistant", ""), {}, "Model request failed"),
    ]);
    const agent = new Agent(client, "Answer the task.", []);

    await expect(agent.run("Complete the task")).rejects.toThrow(
      "Model request failed",
    );
  });

  test("when the model returns a single tool call, uses its result to complete the task", async () => {
    const tool = new TestTool<{ value: string }, string>(
      "echo",
      (_context, { value }) => value,
    );
    const client = new ScriptedLLMClient([
      new LLMResponse(new ToolCall("echo", "call-1", { value: "complete" }), {
        response_id: "response-1",
      }),
      new LLMResponse(new Message("assistant", "Task complete."), {}),
    ]);
    const agent = new Agent(client, "Use tools when needed.", [tool]);

    const result = await agent.run("Complete the task");

    expect(result.response).toBe("Task complete.");
    expect(tool.executions).toHaveLength(1);
    expect(client.requests[1]?.toolResults).toEqual([
      new ToolResult("call-1", false, "complete"),
    ]);
  });

  test("when the model returns a tool result, rejects the unsupported response", async () => {
    const client = new ScriptedLLMClient([
      new LLMResponse(new ToolResult("call-1", false, "unexpected"), {}),
    ]);
    const agent = new Agent(client, "Answer the task.", [], 1);

    await expect(agent.run("Complete the task")).rejects.toThrow(
      "Model returned an unsupported response.",
    );
  });

  test("when the model returns malformed data, rejects the unsupported response", async () => {
    const malformedResponse = { type: "unexpected", value: 42 } as never;
    const client = new ScriptedLLMClient([
      new LLMResponse(malformedResponse, {}),
    ]);
    const agent = new Agent(client, "Answer the task.", [], 1);

    await expect(agent.run("Complete the task")).rejects.toThrow(
      "Model returned an unsupported response.",
    );
  });

  test("when the model returns a mixed tool-call batch, rejects it without executing tools", async () => {
    const tool = new TestTool("echo", () => "complete");
    const client = new ScriptedLLMClient([
      new LLMResponse(
        [
          new ToolCall("echo", "call-1", {}),
          new Message("assistant", "Unexpected message"),
        ],
        { response_id: "response-1" },
      ),
    ]);
    const agent = new Agent(client, "Use tools when needed.", [tool], 1);

    await expect(agent.run("Complete the task")).rejects.toThrow(
      "Model returned an invalid tool-call batch.",
    );
    expect(tool.executions).toHaveLength(0);
  });

  test("when the model returns an empty tool request, rejects the invalid response", async () => {
    const client = new ScriptedLLMClient([
      new LLMResponse([], { response_id: "response-1" }),
    ]);
    const agent = new Agent(client, "Use tools when needed.", [], 1);

    await expect(agent.run("Complete the task")).rejects.toThrow(
      "Model returned an empty tool request.",
    );
  });
});

describe("Agent iteration limits", () => {
  test("when tool calls exceed the iteration limit, stops the task", async () => {
    const tool = new TestTool("repeat", () => "continue");
    const client = new ScriptedLLMClient([
      new LLMResponse([new ToolCall("repeat", "call-1", {})], {
        response_id: "response-1",
      }),
      new LLMResponse([new ToolCall("repeat", "call-2", {})], {
        response_id: "response-2",
      }),
    ]);
    const agent = new Agent(client, "Use tools when needed.", [tool], 2);

    await expect(agent.run("Keep using the tool")).rejects.toThrow(
      "Agent stopped after 2 iterations without a final answer.",
    );
  });
});
