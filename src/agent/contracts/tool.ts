import type { ExecutionContext } from "./execution-context";

type ToolParameters = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export abstract class Tool<TInput = unknown, TOutput = unknown> {
  abstract name: string;
  abstract description: string;
  abstract parameters: ToolParameters;
  abstract execute: (
    context: ExecutionContext,
    input: TInput,
  ) => Promise<TOutput>;
}
