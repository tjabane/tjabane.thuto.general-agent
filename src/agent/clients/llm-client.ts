import type { Tool } from "../contracts/tool";
import type { Message } from "../models/agent";
import type { LLMResponse } from "../models/llm";

export interface LLMClient {
  generate(
    instruction: string,
    tools: Tool[],
    messages: Message[],
  ): Promise<LLMResponse>;
}
