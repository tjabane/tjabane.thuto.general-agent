import type { Tool } from "../../src/agent";
import { Agent } from "../../src/agent/agent";
import { OpenAIClient } from "../../src/agent/clients/openai-client";
import { CalculatorTool } from "../../src/tools";

const instruction = "You are a helpful assistant. Answer concisely.";
const message = "what 390 times 987";

if (import.meta.main) {
  const client = new OpenAIClient();
  const tools: Tool[] = [new CalculatorTool()]
  const agent = new Agent(client, instruction, tools);
  const response = await agent.run(message);

  console.dir(response, { depth: null });
}
