import OpenAI from "openai";
import type { Tool } from "../contracts/tool";
import { Message, ToolCall } from "../models/agent";
import type { LLMClient } from "./llm-client";
import { LlmRequest, LLMResponse } from "../models/llm";

export class OpenAIClient implements LLMClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly temperature: number;

  constructor(model: string, temperature: number = 1) {
    this.client = new OpenAI();
    this.model = model;
    this.temperature = temperature;
  }

  async generate(request: LlmRequest): Promise<LLMResponse> {
    try {
      const {instruction, tools, messages, toolResults } = request;
      const response = await this.client.responses.create({
        model: this.model,
        instructions: instruction,
        tools: OpenAIClient.mapToolsToOpenAITools(tools),
        // The agent executes one tool call per iteration.
        parallel_tool_calls: false,
        previous_response_id: request.previousResponseId,
        input: toolResults.length > 0
          ? [
              ...toolResults.map((toolResult) => ({
                type: "function_call_output" as const,
                call_id: toolResult.call_id,
                output: JSON.stringify({
                  failed: toolResult.failed,
                  response: toolResult.response,
                }),
              })),
            ]
          : messages,
        temperature: this.temperature,
      });

      const metadata = {
        total_tokens: response.usage?.total_tokens,
        response_id: response.id,
      };
      const toolCall = response.output.find(
        (item) => item.type === "function_call",
      );

      if (toolCall) {
        const tool = new ToolCall(
          toolCall.name,
          toolCall.call_id,
          JSON.parse(toolCall.arguments),
        );
        return new LLMResponse(tool, metadata);
      }

      const message = new Message("assistant", response.output_text);
      return new LLMResponse(message, metadata);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(errorMessage);
      return new LLMResponse(new Message("assistant", ""), {}, errorMessage);
    }
  }

  private static mapToolsToOpenAITools(tools: Tool[]): any[] {
    return tools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: true,
    }));
  }
}
