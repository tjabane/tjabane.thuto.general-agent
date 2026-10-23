import type { LLMClient } from "../src/agent/clients/llm-client";
import { OllamaClient } from "../src/agent/clients/ollama-client";
import { OpenAIClient } from "../src/agent/clients/openai-client";

/** Creates the LLM client for a provider ("openai" or "ollama"), defaulting to LLM_PROVIDER. */
export function createClient(
  provider = process.env.LLM_PROVIDER ?? "openai",
): LLMClient {
  switch (provider) {
    case "ollama":
      return new OllamaClient(process.env.OLLAMA_MODEL);
    case "openai":
      return new OpenAIClient(process.env.OPENAI_MODEL ?? "gpt-5");
    default:
      throw new Error(
        `Unknown LLM provider "${provider}". Use "openai" or "ollama".`,
      );
  }
}
