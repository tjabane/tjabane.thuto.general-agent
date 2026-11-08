import OpenAI from "openai";
import type { Tool } from "../contracts/tool";
import { Message, ToolCall, ToolResult } from "../models/agent";
import {
  type ConversationTurn,
  LLMResponse,
  type LlmRequest,
} from "../models/llm";
import type { LLMClient } from "./llm-client";

export class OpenAIClient implements LLMClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(model: string) {
    this.client = new OpenAI();
    this.model = model;
  }

  async generate(request: LlmRequest): Promise<LLMResponse> {
    try {
      const { instruction, tools, turns } = request;
      const response = await this.client.responses.create({
        model: this.model,
        instructions: instruction,
        tools: OpenAIClient.mapToolsToOpenAITools(tools),
        parallel_tool_calls: true,
        input: OpenAIClient.mapTurnsToOpenAIInput(turns),
      });

      const metadata = {
        total_tokens: response.usage?.total_tokens,
        response_id: response.id,
      };
      const toolCalls = response.output.filter(
        (item) => item.type === "function_call",
      );

      if (toolCalls?.length) {
        const toolRequests = toolCalls.map(
          (tool) =>
            new ToolCall(tool.name, tool.call_id, JSON.parse(tool.arguments)),
        );
        return new LLMResponse(
          toolRequests as [ToolCall, ...ToolCall[]],
          metadata,
        );
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

  private static mapTurnsToOpenAIInput(turns: readonly ConversationTurn[]) {
    return turns.flatMap((turn) =>
      turn.items.map((item) => {
        if (item instanceof Message) {
          return {
            type: "message" as const,
            role: item.role,
            content: item.content,
          };
        }
        if (item instanceof ToolCall) {
          return {
            type: "function_call" as const,
            call_id: item.call_id,
            name: item.name,
            arguments: JSON.stringify(item.arguments),
          };
        }
        if (item instanceof ToolResult) {
          return {
            type: "function_call_output" as const,
            call_id: item.call_id,
            output: JSON.stringify({
              failed: item.failed,
              response: item.response,
            }),
          };
        }

        throw new Error("Unsupported conversation item.");
      }),
    );
  }

  private static mapToolsToOpenAITools(tools: readonly Tool[]): any[] {
    return tools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: true,
    }));
  }
}
