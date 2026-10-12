import type { LlmRequest, LLMResponse } from "../models/llm";

export interface LLMClient {
  generate(request: LlmRequest): Promise<LLMResponse>;
}
