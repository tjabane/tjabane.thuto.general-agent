import type { Tool } from "../../src/agent";
import { Agent } from "../../src/agent/agent";
import type { LLMClient } from "../../src/agent/clients/llm-client";
import { OllamaClient } from "../../src/agent/clients/ollama-client";
import { OpenAIClient } from "../../src/agent/clients/openai-client";
import { CalculatorTool, WebSearchTool } from "../../src/tools";

const instruction = "You are a helpful assistant. Answer concisely.";
const message = "What was the population of South Africa according to its 2022 census, and what is that number divided by the country's land area in square kilometres?";

/** Picks the LLM client from LLM_PROVIDER ("openai" or "ollama"). */
function createClient(): LLMClient {
  const provider = process.env.LLM_PROVIDER ?? "openai";

  switch (provider) {
    case "ollama":
      return new OllamaClient(process.env.OLLAMA_MODEL);
    case "openai":
      return new OpenAIClient(process.env.OPENAI_MODEL);
    default:
      throw new Error(`Unknown LLM_PROVIDER "${provider}". Use "openai" or "ollama".`);
  }
}

if (import.meta.main) {
  const client = createClient();
  const tools: Tool[] = [new CalculatorTool(), new WebSearchTool()]
  const agent = new Agent(client, instruction, tools);
  const result = await agent.run(message);
  console.dir(result.response, { depth: null });
  console.dir(result.context.iteration, { depth: null });
}
