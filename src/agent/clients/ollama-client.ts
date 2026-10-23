import { randomUUID } from "node:crypto";
import type { Tool } from "../contracts/tool";
import { Message, ToolCall } from "../models/agent";
import { LLMResponse, type LlmRequest } from "../models/llm";
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
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly temperature: number;
  // Ollama's chat API is stateless, so the client keeps each tool-calling
  // conversation, keyed by response id, to emulate previousResponseId chaining.
  private readonly conversations = new Map<
    string,
    { messages: OllamaMessage[]; toolNames: Map<string, string> }
  >();

  constructor(
    model = "glm-5.3-flash:cloud",
    temperature = 1,
    baseUrl = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434",
  ) {
    this.model = model;
    this.temperature = temperature;
    this.baseUrl = OllamaClient.toHttpUrl(baseUrl);
  }

  async generate(request: LlmRequest): Promise<LLMResponse> {
    try {
      const messages = this.buildMessages(request);
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
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
        this.conversations.set(responseId, {
          messages: [
            ...messages,
            {
              role: "assistant",
              content: body.message.content,
              tool_calls: ollamaToolCalls,
            },
          ],
          toolNames: new Map(
            toolCalls.map((toolCall) => [toolCall.call_id, toolCall.name]),
          ),
        });

        return new LLMResponse(toolCalls, metadata);
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

  /**
   * Continues the stored conversation when the request carries tool results,
   * otherwise starts a new one from the agent's messages.
   */
  private buildMessages(request: LlmRequest): OllamaMessage[] {
    const previous = request.previousResponseId
      ? this.conversations.get(request.previousResponseId)
      : undefined;

    if (request.toolResults.length > 0) {
      if (!previous) {
        throw new Error(
          `No conversation found for response ${request.previousResponseId}.`,
        );
      }

      this.conversations.delete(request.previousResponseId as string);
      return [
        ...previous.messages,
        ...request.toolResults.map((toolResult) => ({
          role: "tool" as const,
          tool_name: previous.toolNames.get(toolResult.call_id),
          content: JSON.stringify({
            failed: toolResult.failed,
            response: toolResult.response,
          }),
        })),
      ];
    }

    return [
      { role: "system", content: request.instruction },
      ...request.messages.map(({ role, content }) => ({ role, content })),
    ];
  }

  private static mapTools(tools: Tool[]): object[] {
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
