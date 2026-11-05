import { ToolCall, ToolResult } from "../models/agent"
import { LlmRequest, LLMResponse } from "../models/llm"
import { ExecutionContext } from "../models/agent-runtime"


export type HookDecision<T> =
  | { type: "continue"; value: T }
  | { type: "reject"; reason: string };

export interface AgentHooks {
  beforeLLM?(request:LlmRequest, context: ExecutionContext): Promise<LLMResponse | undefined>
  beforeToolUse?(
    toolCall: ToolCall,
    context: ExecutionContext,
  ): HookDecision<ToolCall> | Promise<HookDecision<ToolCall>>;

  afterToolUse?(
    result: ToolResult,
    context: ExecutionContext,
  ): HookDecision<ToolResult> | Promise<HookDecision<ToolResult>>;
}