import type { Tool } from "../../src/agent";
import { Agent } from "../../src/agent/agent";
import { CodeExecutionTool } from "../../src/tools";
import { createClient } from "../create-client";

const instruction = "You can execute Python code to solve problems.";
const message = "What is the 100th Fibonacci number?";

if (import.meta.main) {
  const client = createClient("openai");
  const tools: Tool[] = [new CodeExecutionTool()];
  const agent = new Agent(client, instruction, tools, 30);
  const result = await agent.run(message);
  console.dir(result.response, { depth: null });
  console.dir(result.context, { depth: null });
}
