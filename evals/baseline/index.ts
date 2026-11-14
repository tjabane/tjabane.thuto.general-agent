import type { Tool } from "../../src/agent";
import { Agent } from "../../src/agent/agent";
import { Message, type Role, ToolCall } from "../../src/agent/models/agent";
import {
  BashExecutionTool,
  CodeExecutionTool,
  FileUploadTool,
} from "../../src/tools";
import { createClient } from "../create-client";

const instruction = `You have access to a sandboxed Linux environment.
    You can upload files, run bash commands, and execute Python code.
    Use these capabilities to analyze data and solve problems.`;
const message = `The attached spreadsheet contains the sales of menu items
for a regional fast-food chain. Which city had the greater total sales:
Wharvton or Algrimand?

The file is located at: ./.data/gaia/2023/validation/7cc4acfa-63fd-4acc-a1a1-e8e529e0a97f.xlsx`;

type TraceItem =
  | { type: "message"; role: Role; content: string }
  | { type: "tool_call"; name: string; params: unknown };

function compactTrace(
  events: ReturnType<Awaited<ReturnType<Agent["run"]>>["context"]["getEvents"]>,
): TraceItem[] {
  return events.flatMap((event) => {
    const items: TraceItem[] = [];

    for (const item of event.content) {
      if (item instanceof Message) {
        items.push({ type: "message", role: item.role, content: item.content });
      }

      if (item instanceof ToolCall) {
        items.push({
          type: "tool_call",
          name: item.name,
          params: item.arguments,
        });
      }
    }

    return items;
  });
}

if (import.meta.main) {
  const client = createClient("openai");
  const tools: Tool[] = [
    new CodeExecutionTool(),
    new BashExecutionTool(),
    new FileUploadTool(),
  ];
  const agent = new Agent(client, instruction, tools, 30);
  const result = await agent.run(message);
  console.dir(result.response, { depth: null });
  console.dir(compactTrace(result.context.getEvents()), { depth: null });
}
