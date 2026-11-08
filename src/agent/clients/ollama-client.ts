import { randomUUID } from "node:crypto";
import type { Tool } from "../contracts/tool";
import { Message, ToolCall, ToolResult } from "../models/agent";
import {
  type ConversationTurn,
  LLMResponse,
  type LlmRequest,
} from "../models/llm";
import type { LLMClient } from "./llm-client";

type OllamaToolCall = {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
};

type OllamaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
};

type OllamaChatResponse = {
  message: {
    content: string;
    tool_calls?: OllamaToolCall[];
  };
  prompt_eval_count?: number;
  eval_count?: number;
};

/** An LLM client for a local Ollama server and Ollama Cloud models. */
export class OllamaClient implements LLMClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly temperature: number;
  constructor(
    model = "glm-5.3-flash:cloud",
    temperature = 1,
    baseUrl = process.env.OLLAMA_BASE_URL ??
      process.env.OLLAMA_HOST ??
      "http://127.0.0.1:11434",
    apiKey = process.env.OLLAMA_API_KEY,
  ) {
    this.model = model;
    this.temperature = temperature;
    this.baseUrl = OllamaClient.toHttpUrl(baseUrl);
    this.apiKey = apiKey;
  }

  async generate(request: LlmRequest): Promise<LLMResponse> {
    try {
      const messages = this.buildMessages(request);
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          messages,
          tools: OllamaClient.mapTools(request.tools),
          options: { temperature: this.temperature },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Ollama returned ${response.status}: ${await response.text()}`,
        );
      }

      const body = (await response.json()) as OllamaChatResponse;
      const ollamaToolCalls = body.message.tool_calls ?? [];
      const responseId = randomUUID();
      const metadata = {
        prompt_tokens: body.prompt_eval_count,
        completion_tokens: body.eval_count,
        response_id: responseId,
      };

      if (ollamaToolCalls.length > 0) {
        // Ollama has no call ids, so the client assigns one per call.
        const toolCalls = ollamaToolCalls.map(
          ({ function: { name, arguments: args } }) =>
            new ToolCall(name, randomUUID(), args),
        );
        return new LLMResponse(
          toolCalls as [ToolCall, ...ToolCall[]],
          metadata,
        );
      }

      return new LLMResponse(
        new Message("assistant", body.message.content),
        metadata,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return new LLMResponse(
        new Message("assistant", ""),
        {},
        `Ollama request failed: ${errorMessage}`,
      );
    }
  }

  private buildMessages(request: LlmRequest): OllamaMessage[] {
    return [
      { role: "system", content: request.instruction },
      ...OllamaClient.mapTurns(request.turns),
    ];
  }

  private static mapTurns(turns: readonly ConversationTurn[]): OllamaMessage[] {
    const toolNames = new Map<string, string>();
    for (const turn of turns) {
      for (const item of turn.items) {
        if (item instanceof ToolCall) {
          toolNames.set(item.call_id, item.name);
        }
      }
    }

    return turns.flatMap((turn) => {
      const messages: OllamaMessage[] = [];
      const toolCalls = turn.items.filter(
        (item): item is ToolCall => item instanceof ToolCall,
      );

      for (const item of turn.items) {
        if (item instanceof Message) {
          messages.push({ role: item.role, content: item.content });
        }
      }

      if (toolCalls.length > 0) {
        messages.push({
          role: "assistant",
          content: "",
          tool_calls: toolCalls.map((toolCall) => ({
            function: {
              name: toolCall.name,
              arguments: toolCall.arguments,
            },
          })),
        });
      }

      for (const item of turn.items) {
        if (item instanceof ToolResult) {
          const toolName = toolNames.get(item.call_id);
          if (!toolName) {
            throw new Error(`No tool call found for result ${item.call_id}.`);
          }
          messages.push({
            role: "tool",
            tool_name: toolName,
            content: JSON.stringify({
              failed: item.failed,
              response: item.response,
            }),
          });
        }
      }

      return messages;
    });
  }

  private static mapTools(tools: readonly Tool[]): object[] {
    return tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  private static toHttpUrl(host: string): string {
    const url =
      host.startsWith("http://") || host.startsWith("https://")
        ? host
        : `http://${host}`;
    return url.replace(/\/$/, "");
  }
}
