import type { Tool } from "../contracts/tool";
import { type ConversationItem, type ModelOutput, ToolResult } from "./agent";
import type { ExecutionContext } from "./agent-runtime";

export type ConversationTurn = {
  readonly author: string;
  readonly items: readonly ConversationItem[];
};

export class LlmRequest {
  constructor(
    readonly instruction: string,
    readonly tools: readonly Tool[],
    readonly turns: readonly ConversationTurn[] = [],
  ) {}

  get toolResults(): readonly ToolResult[] {
    return this.turns
      .flatMap((turn) => turn.items)
      .filter((item): item is ToolResult => item instanceof ToolResult);
  }

  static fromContext(
    instruction: string,
    context: ExecutionContext,
    tools: readonly Tool[],
  ): LlmRequest {
    const turns = context.getEvents().map((event) => ({
      author: event.author,
      items: event.content,
    }));

    return new LlmRequest(instruction, tools, turns);
  }
}

export class LLMResponse {
  constructor(
    readonly data: ModelOutput,
    readonly metadata: Record<string, any>,
    readonly error: string = "",
  ) {}
}
