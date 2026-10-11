import { Agent } from "../../src/agent/agent";
import { OpenAIClient } from "../../src/agent/clients/openai-client";

const instruction = "You are a helpful assistant. Answer concisely.";
const message = "Reply with exactly: baseline evaluation passed";

if (import.meta.main) {
  const client = new OpenAIClient();
  const agent = new Agent(client, instruction, []);
  const response = await agent.run(message);

  console.dir(response, { depth: null });
}
