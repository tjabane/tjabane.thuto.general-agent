import { mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { Agent } from "../../src/agent/agent";
import {
  CalculatorTool,
  ListDirectoryTool,
  ReadFileTool,
  ReadMediaTool,
  UnzipTool,
  WebSearchTool,
} from "../../src/tools";
import { createClient } from "../create-client";
import {
  GAIA_Prompt,
  type GaiaEvaluationReport,
  runGaiaEvaluation,
} from "./gaia-benchmark";
import type { GaiaLevel } from "./gaia-dataset";

const RUNS_DIR = ".data/gaia/runs";

function createGaiaAgent(provider?: string): Agent {
  const client = createClient(
    provider ?? process.env.GAIA_PROVIDER ?? process.env.LLM_PROVIDER,
  );
  return new Agent(
    client,
    GAIA_Prompt,
    [
      new CalculatorTool(),
      new WebSearchTool(),
      new ListDirectoryTool(),
      new ReadFileTool(),
      new ReadMediaTool(),
      new UnzipTool(),
    ],
    30,
  );
}

function summarize({
  evaluations,
  skippedWithAttachments,
}: GaiaEvaluationReport) {
  const correct = evaluations.filter((evaluation) => evaluation.correct).length;
  const errors = evaluations.filter((evaluation) => evaluation.error).length;

  return {
    problems: evaluations.length,
    correct,
    accuracy: `${((correct / evaluations.length) * 100).toFixed(1)}%`,
    errors,
    skippedWithAttachments,
    avgIterations: (
      evaluations.reduce((sum, evaluation) => sum + evaluation.iterations, 0) /
      evaluations.length
    ).toFixed(1),
  };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      level: { type: "string", default: "1" },
      count: { type: "string", default: "10" },
      split: { type: "string", default: "validation" },
      concurrency: { type: "string", default: "3" },
      attachments: { type: "boolean", default: false },
      "attachments-only": { type: "boolean", default: false },
      provider: { type: "string" },
      "task-id": { type: "string" },
    },
  });

  const report = await runGaiaEvaluation(
    () => createGaiaAgent(values.provider),
    {
      level: Number(values.level) as GaiaLevel,
      count: Number(values.count),
      split: values.split,
      concurrency: Number(values.concurrency),
      includeAttachments: values.attachments,
      attachmentsOnly: values["attachments-only"],
      taskId: values["task-id"],
    },
  );

  console.table([summarize(report)]);

  await mkdir(RUNS_DIR, { recursive: true });
  const path = `${RUNS_DIR}/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await Bun.write(path, JSON.stringify(report, null, 2));
  console.log(`Report saved to ${path}`);
}
