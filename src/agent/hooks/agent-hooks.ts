import { ToolCall, ToolResult } from "../models/agent"
import { ExecutionContext } from "../models/agent-runtime"
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process"

export type HookDecision<T> =
  | { type: "continue"; value: T }
  | { type: "reject"; reason: string };

export interface AgentHooks {
  beforeToolUse?(
    toolCall: ToolCall,
    context: ExecutionContext,
  ): HookDecision<ToolCall> | Promise<HookDecision<ToolCall>>;

  afterToolUse?(
    result: ToolResult,
    context: ExecutionContext,
  ): HookDecision<ToolResult> | Promise<HookDecision<ToolResult>>;
}


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
