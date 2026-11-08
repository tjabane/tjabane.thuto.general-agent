import type { LLMClient } from "../../../src/agent/clients/llm-client";
import {
  type ConversationItem,
  Message,
  ToolCall,
  ToolResult,
} from "../../../src/agent/models/agent";
import { type LLMResponse, LlmRequest } from "../../../src/agent/models/llm";

/** A deterministic LLM client that returns queued responses and records requests. */
export class ScriptedLLMClient implements LLMClient {
  readonly requests: LlmRequest[] = [];
  private readonly responses: LLMResponse[];

  constructor(responses: LLMResponse[]) {
    this.responses = [...responses];
  }

  async generate(request: LlmRequest): Promise<LLMResponse> {
    this.requests.push(ScriptedLLMClient.snapshot(request));

    const response = this.responses.shift();
    if (!response) {
      throw new Error(
        `No scripted LLM response available for request ${this.requests.length}.`,
      );
    }

    return response;
  }

  private static snapshot(request: LlmRequest): LlmRequest {
    return new LlmRequest(
      request.instruction,
      [...request.tools],
      request.turns.map((turn) => ({
        author: turn.author,
        items: turn.items.map(ScriptedLLMClient.cloneItem),
      })),
    );
  }

  private static cloneItem(item: ConversationItem): ConversationItem {
    if (item instanceof Message) {
      return new Message(item.role, item.content);
    }
    if (item instanceof ToolCall) {
      return new ToolCall(
        item.name,
        item.call_id,
        structuredClone(item.arguments),
      );
    }
    return new ToolResult(
      item.call_id,
      item.failed,
      structuredClone(item.response),
    );
  }
}
