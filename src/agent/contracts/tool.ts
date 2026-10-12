import type { ExecutionContext } from "./execution-context";

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
    context: ExecutionContext,
    input: TInput,
  ) => Promise<TOutput>;
}
