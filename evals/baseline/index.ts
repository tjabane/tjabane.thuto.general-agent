import type { Tool } from "../../src/agent";
import { Agent } from "../../src/agent/agent";
import { CalculatorTool, WebSearchTool } from "../../src/tools";
import { createClient } from "../create-client";

const instruction = "You are a helpful assistant. Answer concisely.";
const message =
  "If Eliud Kipchoge could maintain his record-making marathon pace indefinitely, how many thousand hours would it take him to run the distance between the Earth and the Moon at its closest approach? Please use the minimum perigee value on the Wikipedia page for the Moon when carrying out your calculation. Round your result to the nearest 1000 hours and do not use any comma separators if necessary.";

if (import.meta.main) {
  const client = createClient();
  const tools: Tool[] = [new CalculatorTool(), new WebSearchTool()];
  const agent = new Agent(client, instruction, tools);
  const result = await agent.run(message);
  console.dir(result.response, { depth: null });
  console.dir(result.context, { depth: null });
}
