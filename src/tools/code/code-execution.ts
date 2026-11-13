import { type ExecutionContext, Tool } from "@general-agent/agent";

type CodeExecutionInput = {
  code: string;
};

type CodeExecutionOutput = {
  results: string;
};

export class CodeExecutionTool extends Tool<
  CodeExecutionInput,
  CodeExecutionOutput
> {
  readonly name = "code execution";
  readonly description =
    "Executes Python code in an isolated sandbox. Use it for calculations, data processing, testing snippets, and generating files. Returns the execution output. Code cannot access the host machine.";
  readonly parameters = {
    type: "object" as const,
    properties: {
      code: {
        type: "string",
        description: "The code to execute",
      },
    },
    required: ["code"],
    additionalProperties: false,
  };

  readonly execute = async (
    context: ExecutionContext,
    { code }: CodeExecutionInput,
  ): Promise<CodeExecutionOutput> => {
    if (!context.codeEnv) {
      throw new Error("No code execution environment available.");
    }

    const execution = await context.codeEnv.runCode(code);
    return { results: JSON.stringify(execution.toJSON()) ?? "" };
  };
}
