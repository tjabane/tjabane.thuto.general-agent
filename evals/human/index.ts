import { mkdir } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { Agent } from "../../src/agent/agent";
import type { ExecutionContext } from "../../src/agent/models/agent-runtime";
import { InMemorySessionStore } from "../../src/agent/session/session-store";
import {
  CalculatorTool,
  ListDirectoryTool,
  ReadFileTool,
  ReadMediaTool,
  UnzipTool,
  WebSearchTool,
} from "../../src/tools";
import { createClient } from "../create-client";

const RUNS_DIR = ".data/human/runs";
const DEFAULT_INSTRUCTION =
  "You are a helpful assistant having a conversation with a human. Remember and use relevant details from earlier turns.";

type ConversationTurn = {
  user: string;
  assistant?: string;
  error?: string;
  durationMs: number;
};

function printHelp(): void {
  console.log(`Human conversation evaluation

Usage:
  bun run eval:human [--provider openai|ollama] [--instruction "..."]

Commands:
  /exit or /quit  End the conversation and save its trace
  Ctrl+C          End the conversation
`);
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean", short: "h", default: false },
      instruction: { type: "string", default: DEFAULT_INSTRUCTION },
      provider: { type: "string" },
      "session-id": { type: "string" },
    },
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const provider = values.provider ?? process.env.LLM_PROVIDER ?? "openai";
  let sessionId = values["session-id"];
  const sessionStore = new InMemorySessionStore();
  let context: ExecutionContext | undefined;
  const agent = new Agent(
    createClient(provider),
    values.instruction,
    [
      new CalculatorTool(),
      new WebSearchTool(),
      new ListDirectoryTool(),
      new ReadFileTool(),
      new ReadMediaTool(),
      new UnzipTool(),
    ],
    30,
    sessionStore,
    {},
  );
  const terminal = createInterface({ input: stdin, output: stdout });
  const turns: ConversationTurn[] = [];
  const startedAt = new Date().toISOString();

  console.log(
    `Human conversation evaluation (${provider}, session ${sessionId ?? "new"})`,
  );
  console.log("Enter /exit or press Ctrl+C to finish.\n");
  terminal.setPrompt("You> ");
  terminal.prompt();

  for await (const line of terminal) {
    const message = line.trim();
    if (message === "/exit" || message === "/quit") {
      terminal.close();
      break;
    }
    if (!message) {
      terminal.prompt();
      continue;
    }

    const start = performance.now();
    try {
      const result = await agent.run(message, sessionId, context);
      context = result.context;
      sessionId = result.context.session?.id ?? sessionId;
      turns.push({
        user: message,
        assistant: result.response,
        durationMs: Math.round(performance.now() - start),
      });
      console.log(`\nAgent> ${result.response}\n`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      turns.push({
        user: message,
        error: reason,
        durationMs: Math.round(performance.now() - start),
      });
      console.error(`\nAgent error> ${reason}\n`);
    }
    terminal.prompt();
  }

  if (turns.length > 0) {
    await mkdir(RUNS_DIR, { recursive: true });
    const reportPath = `${RUNS_DIR}/${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`;
    await Bun.write(
      reportPath,
      JSON.stringify(
        {
          sessionId: context?.session?.id ?? sessionId,
          provider,
          instruction: values.instruction,
          startedAt,
          endedAt: new Date().toISOString(),
          turns,
          events: context?.session?.events ?? [],
        },
        null,
        2,
      ),
    );
    console.log(`Conversation saved to ${reportPath}`);
  } else {
    console.log("No conversation turns to save.");
  }
}
