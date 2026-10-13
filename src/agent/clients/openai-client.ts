import OpenAI from "openai";
import type { Tool } from "../contracts/tool";
import type { Message, ToolCall } from "../models/agent";
import type { LLMClient } from "./llm-client";
import { LlmRequest, LLMResponse } from "../models/llm";

export class OpenAIClient implements LLMClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly temperature: number;

  constructor(model: string = "gpt-4o", temperature: number = 1) {
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
        input: toolResults.length > 0
          ? [
              ...messages,
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

      const metadata = { total_tokens: response.usage?.total_tokens };
      const toolCall = response.output.find(
        (item) => item.type === "function_call",
      );

      if (toolCall) {
        const tool: ToolCall = {
          name: toolCall.name,
          call_id: toolCall.call_id,
          arguments: JSON.parse(toolCall.arguments),
        };
        return new LLMResponse(tool, metadata);
      }

      const message: Message = {
        role: "assistant",
        content: response.output_text,
      };
      return new LLMResponse(message, metadata);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(errorMessage);
      return new LLMResponse({ role: "assistant", content: "" }, {}, errorMessage);
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
