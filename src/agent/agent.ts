import type { LLMClient } from "./clients/llm-client";
import type { Tool } from "./contracts/tool";
import { Message, ToolCall, ToolResult } from "./models/agent";
import { AgentResult, Event, ExecutionContext } from "./models/agent-runtime";
import { type LLMResponse, LlmRequest } from "./models/llm";

export class Agent {
  private readonly messages: Message[];
  private readonly client: LLMClient;
  private readonly instruction: string;
  private readonly tools: Tool[];
  private readonly maxIterations: number = 10;

  constructor(
    client: LLMClient,
    instruction: string,
    tools: Tool[],
    maxIterations: number = 10,
  ) {
    this.messages = [];
    this.client = client;
    this.instruction = instruction;
    this.tools = tools;
    this.maxIterations = maxIterations;
  }

  async run(
    message: string,
    context: ExecutionContext = new ExecutionContext(),
  ): Promise<AgentResult> {
    const userMessage = new Message("user", message);
    const userEvent = new Event(context.runId, "user", userMessage);
    this.messages.push(userMessage);
    context.addEvent(userEvent);

    let request: LlmRequest = new LlmRequest(
      this.instruction,
      this.tools,
      this.messages,
    );

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
        this.messages.push(modelOutput);
        context.result = modelOutput.content;
        return new AgentResult(modelOutput.content, context);
      }

      const toolCalls =
        modelOutput instanceof ToolCall ? [modelOutput] : modelOutput;

      if (!Array.isArray(toolCalls)) {
        throw new Error("Model returned an unsupported response.");
      }

      if (toolCalls.length === 0) {
        throw new Error("Model returned an empty tool request.");
      }

      if (
        !toolCalls.every((item): item is ToolCall => item instanceof ToolCall)
      ) {
        throw new Error("Model returned an invalid tool-call batch.");
      }

      const results = await this.executeTools(toolCalls, context);

      request = new LlmRequest(
        this.instruction,
        this.tools,
        this.messages,
        results,
        response.metadata.response_id,
      );
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

    for (const result of allResults) {
      context.addEvent(new Event(context.runId, result.type, result));
    }
    return allResults;
  }
}
