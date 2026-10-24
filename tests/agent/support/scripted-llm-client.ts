import type { LLMClient } from "../../../src/agent/clients/llm-client";
import { Message, ToolResult } from "../../../src/agent/models/agent";
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
      request.messages.map(({ role, content }) => new Message(role, content)),
      request.toolResults.map(
        ({ call_id, failed, response }) =>
          new ToolResult(call_id, failed, structuredClone(response)),
      ),
      request.previousResponseId,
    );
  }
}
