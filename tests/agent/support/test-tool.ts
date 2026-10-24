import type { ExecutionContext } from "../../../src/agent/contracts/execution-context";
import { Tool } from "../../../src/agent/contracts/tool";

export type TestToolExecution<TInput> = {
  context: ExecutionContext;
  input: TInput;
};

/** A lightweight tool that records calls and delegates behavior to a test handler. */
export class TestTool<
  TInput = Record<string, never>,
  TOutput = unknown,
> extends Tool<TInput, TOutput> {
  readonly description: string;
  readonly parameters = {
    type: "object" as const,
    properties: {},
    additionalProperties: true,
  };
  readonly executions: TestToolExecution<TInput>[] = [];

  constructor(
    readonly name: string,
    private readonly handler: (
      context: ExecutionContext,
      input: TInput,
    ) => Promise<TOutput> | TOutput,
    description = `Test tool ${name}.`,
  ) {
    super();
    this.description = description;
  }

  readonly execute = async (
    context: ExecutionContext,
    input: TInput,
  ): Promise<TOutput> => {
    this.executions.push({ context, input });
    return this.handler(context, input);
  };
}
