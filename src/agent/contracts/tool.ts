type ToolParameters = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export interface Tool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  parameters: ToolParameters;
  execute: (input: TInput) => Promise<TOutput>;
}
