import { type ExecutionContext, Tool } from "@general-agent/agent";
import type { Sandbox } from "e2b";

type BashInput = {
  command: string;
};

type BashOutput = {
  results: string;
};

export class BashExecutionTool extends Tool<BashInput, BashOutput> {
  readonly name = "bash_execution";
  readonly description =
    "Executes Bash commands in an isolated sandbox. Use it for system operations, file manipulations, and running scripts. Commands cannot access the host machine.";
  readonly parameters = {
    type: "object" as const,
    properties: {
      command: {
        type: "string",
        description: "The Bash command to execute",
      },
    },
    required: ["command"],
    additionalProperties: false,
  };
  readonly execute = async (
    context: ExecutionContext,
    { command }: BashInput,
  ): Promise<BashOutput> => {
    if (!context.codeEnv) {
      throw new Error("No sandbox execution environment available.");
    }

    const results = await context.codeEnv.commands.run(command);
    return { results: this.formatCommandResult(results) ?? "" };
  };

  private formatCommandResult(
    result: Awaited<ReturnType<Sandbox["commands"]["run"]>>,
  ): string {
    const parts: string[] = [];

    if (result.stdout) parts.push(`[stdout]\n${result.stdout}`);
    if (result.stderr) parts.push(`[stderr]\n${result.stderr}`);
    if (result.error) parts.push(`[error]\n${result.error}`);

    parts.push(`[exit_code] ${result.exitCode}`);
    return parts.join("\n\n");
  }
}
