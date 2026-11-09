import type { LLMClient } from "./clients/llm-client";
import type { Tool } from "./contracts/tool";
import type { AgentHooks } from "./hooks/agent-hooks";
import { Message, ToolCall, ToolResult } from "./models/agent";
import { AgentResult, Event, ExecutionContext } from "./models/agent-runtime";
import { type LLMResponse, LlmRequest } from "./models/llm";
import { type TaskMemoryManager } from "./memory/task-memory-manager";
import {
  InMemorySessionStore,
  type SessionStore,
} from "./session/session-store";

export class Agent {
  private readonly client: LLMClient;
  private readonly instruction: string;
  private readonly tools: Tool[];
  private readonly maxIterations: number = 30;
  private readonly sessionStore: SessionStore;
  private readonly memoryManager: TaskMemoryManager|undefined;
  private hooks: AgentHooks;

  constructor(
    client: LLMClient,
    instruction: string,
    tools: Tool[],
    maxIterations: number = 30,
    hooks: AgentHooks = {},
    memoryManager: TaskMemoryManager|undefined,
    sessionStore: SessionStore = new InMemorySessionStore(),
  ) {
    this.client = client;
    this.instruction = instruction;
    this.tools = tools;
    this.maxIterations = maxIterations;
    this.sessionStore = sessionStore;
    this.memoryManager = memoryManager;
    this.hooks = hooks;
  }

  async run(
    message: string,
    sessionId?: string,
    context?: ExecutionContext,
  ): Promise<AgentResult> {
    const session = await this.sessionStore.getOrCreate(sessionId);
    if (!context) {
      context = new ExecutionContext(session, this.sessionStore);
    }

    const userMessage = new Message("user", message);
    const userEvent = new Event(context.runId, "user", userMessage);
    context.addEvent(userEvent);

    let request = LlmRequest.fromContext(this.instruction, context, this.tools);

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      context.incrementIteration();
      const response: LLMResponse = await this.client.generate(request);
      if (response.error) {
        console.error(response.error);
        throw new Error(response.error);
      }
      const modelOutput = response.data;
      context.addEvent(new Event(context.runId, "assistant", modelOutput));

      if (modelOutput instanceof Message) {
        context.result = modelOutput.content;
        if (session) {
          await this.sessionStore.saveSession(session);
        }
        return new AgentResult(modelOutput.content, context);
      }

      const output: unknown = modelOutput;
      const toolCalls: unknown = output instanceof ToolCall ? [output] : output;

      if (!Array.isArray(toolCalls)) {
        throw new Error("Model returned an unsupported response.");
      }

      if (toolCalls.length === 0) {
        throw new Error("Model returned an empty tool request.");
      }

      if (!toolCalls.every((item) => item instanceof ToolCall)) {
        throw new Error("Model returned an invalid tool-call batch.");
      }

      await this.executeTools(toolCalls as ToolCall[], context);

      request = LlmRequest.fromContext(this.instruction, context, this.tools);
    }
    throw new Error(
      `Agent stopped after ${this.maxIterations} iterations without a final answer.`,
    );
  }

  /**
   * Executes a tool call and returns the result.
   * @param toolCall The details of which tool to execute
   * @param context The execution context
   */
  private async executeTools(
    toolCalls: ToolCall[],
    context: ExecutionContext,
  ): Promise<ToolResult[]> {
    const allResults = await Promise.all(
      toolCalls.map(async (toolCall) => {
        const tool = this.tools.find((t) => t.name === toolCall.name);
        if (!tool) {
          return new ToolResult(
            toolCall.call_id,
            true,
            `Tool ${toolCall.name} not found.`,
          );
        } else {
          try {
            const output = await tool.execute(context, toolCall.arguments);
            return new ToolResult(toolCall.call_id, false, output);
          } catch (error) {
            console.error(`Error executing tool ${toolCall.name}:`, error);
            return new ToolResult(
              toolCall.call_id,
              true,
              `Tool ${toolCall.name} execution failed: ${error}`,
            );
          }
        }
      }),
    );

    context.addEvent(new Event(context.runId, "tool", allResults));
    return allResults;
  }
}
