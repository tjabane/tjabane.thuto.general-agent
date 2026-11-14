import type { Sandbox } from "@e2b/code-interpreter";

/** The capabilities tools can use during an agent run. */
export interface ToolExecutionContext {
  readonly runId: string;
  readonly fileAccess?: {
    readonly allowedRoots?: string[];
    readonly maxFileBytes?: number;
    readonly maxOutputBytes?: number;
    readonly maxEntries?: number;
    readonly allowSymlinks?: boolean;
  };
  readonly codeEnv?: Sandbox;
}

type ToolParameters = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

// biome-ignore lint/suspicious/noExplicitAny: lets Tool[] hold tools with any concrete input/output types
export abstract class Tool<TInput = any, TOutput = any> {
  abstract name: string;
  abstract description: string;
  abstract parameters: ToolParameters;
  abstract execute: (
    context: ToolExecutionContext,
    input: TInput,
  ) => Promise<TOutput>;
}
