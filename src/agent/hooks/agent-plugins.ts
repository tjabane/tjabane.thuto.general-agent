import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process"
import type { AgentHooks, HookDecision } from "./agent-hooks"
import { ToolCall } from "../models/agent"
import { ExecutionContext } from "../models/agent-runtime"

export class ToolGatePlugin implements AgentHooks {
    async beforeToolUse(
    toolCall: ToolCall,
    context: ExecutionContext,
  ): Promise<HookDecision<ToolCall>>
  {
    if(toolCall)
    {
        const terminal = createInterface({ input: stdin, output: stdout });
        const answer = await terminal.question("Allow this tool call? (y/n) ");
        terminal.close();
        const approved = answer.trim().toLowerCase() === "y";
        return approved ?  { type: "continue", value: toolCall } : { type: "reject", reason: "user denied" }
    }

    return { type: "continue", value: toolCall }; 

  }
}