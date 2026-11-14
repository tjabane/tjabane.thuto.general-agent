import { Sandbox } from "e2b";

function formatCommandResult(
  result: Awaited<ReturnType<Sandbox["commands"]["run"]>>,
): string {
  const parts: string[] = [];

  if (result.stdout) parts.push(`[stdout]\n${result.stdout}`);
  if (result.stderr) parts.push(`[stderr]\n${result.stderr}`);
  if (result.error) parts.push(`[error]\n${result.error}`);

  parts.push(`[exit_code] ${result.exitCode}`);
  return parts.join("\n\n");
}

const requestedCommand = process.argv.slice(2).join(" ");
const commands = requestedCommand
  ? [requestedCommand]
  : ["pwd", "uname -a", 'printf "Hello from the E2B sandbox\\n"'];

console.log("Creating E2B sandbox...");
const sandbox = await Sandbox.create();

try {
  for (const command of commands) {
    console.log(`\n$ ${command}`);
    const result = await sandbox.commands.run(command);
    console.log(`\n[raw result]\n${JSON.stringify(result, null, 2)}`);
    console.log(formatCommandResult(result));
  }
} finally {
  await sandbox.kill();
  console.log("\nSandbox closed.");
}
