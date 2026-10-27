import { copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Agent } from "../../src/agent/agent";
import { ToolCall } from "../../src/agent/models/agent";
import { ExecutionContext } from "../../src/agent/models/agent-runtime";
import {
  DEFAULT_DATA_ROOT,
  type GaiaLevel,
  getGaiaProblems,
} from "./gaia-dataset";
import type { GaiaEvaluation, GaiaProblem } from "./models";
import { extractFinalAnswer, isCorrectGaiaAnswer } from "./scoring";

export type AgentFactory = () => Agent;

export const GAIA_Prompt = `You are a general AI assistant. I will ask you a question. Report your thoughts, and finish your answer with the following template: FINAL ANSWER: [YOUR FINAL ANSWER].

YOUR FINAL ANSWER should be a number OR as few words as possible OR a comma separated list of numbers and/or strings.

If you are asked for a number, don't use comma to write your number neither use units such as $ or percent sign unless specified otherwise.

If you are asked for a string, don't use articles, neither abbreviations (e.g. for cities), and write the digits in plain text unless otherwise specified.

If you are asked for a comma separated list, apply the above rules depending of whether the element to be put in the list is a number or a string.`;

export type GaiaRunOptions = {
  level: GaiaLevel;
  count: number;
  split: string;
  // How many problems run at the same time.
  concurrency: number;
  // Problems with attached files are skipped until the agent has a file tool.
  includeAttachments: boolean;
  /** Run only problems that have an attached file. */
  attachmentsOnly?: boolean;
  dataRoot?: string;
  taskId?: string;
};

export type GaiaEvaluationReport = {
  options: GaiaRunOptions;
  skippedWithAttachments: number;
  evaluations: GaiaEvaluation[];
};

function toolCallNames(context: ExecutionContext): string[] {
  return context.events
    .map((event) => event.content)
    .flatMap((content) => (Array.isArray(content) ? content : [content]))
    .filter((content): content is ToolCall => content instanceof ToolCall)
    .map((toolCall) => toolCall.name);
}

export function hasGaiaAttachment(problem: GaiaProblem): boolean {
  return Boolean(problem.file_name || problem.file_path);
}

export function selectGaiaProblems(
  problems: GaiaProblem[],
  options: Pick<GaiaRunOptions, "includeAttachments" | "attachmentsOnly">,
): GaiaProblem[] {
  if (options.attachmentsOnly) return problems.filter(hasGaiaAttachment);
  if (options.includeAttachments) return problems;
  return problems.filter((problem) => !hasGaiaAttachment(problem));
}

export async function stageGaiaAttachment(
  problem: GaiaProblem,
  dataRoot: string,
  split: string,
): Promise<{ directory: string; path: string }> {
  if (!hasGaiaAttachment(problem)) {
    throw new Error(`GAIA problem ${problem.task_id} has no attachment.`);
  }

  const source = problem.file_path
    ? path.resolve(path.dirname(dataRoot), problem.file_path)
    : path.resolve(dataRoot, split, problem.file_name ?? "");
  if (!(await Bun.file(source).exists())) {
    throw new Error(`GAIA attachment not found at ${source}.`);
  }

  const directory = await mkdtemp(path.join(os.tmpdir(), "gaia-eval-"));
  const target = path.join(
    directory,
    path.basename(problem.file_name ?? source),
  );
  await copyFile(source, target);
  return { directory, path: target };
}

/** Runs one problem with a fresh agent and scores its answer. */
async function evaluateProblem(
  createAgent: AgentFactory,
  problem: GaiaProblem,
  dataRoot: string,
  split: string,
): Promise<GaiaEvaluation> {
  const staged = hasGaiaAttachment(problem)
    ? await stageGaiaAttachment(problem, dataRoot, split)
    : undefined;
  const context = new ExecutionContext(
    staged ? { fileAccess: { allowedRoots: [staged.directory] } } : undefined,
  );
  const start = Date.now();
  const evaluation = (answer: string, error?: string): GaiaEvaluation => ({
    problem,
    answer,
    correct: isCorrectGaiaAnswer(answer, String(problem["Final answer"])),
    iterations: context.iteration,
    toolCalls: toolCallNames(context),
    durationMs: Date.now() - start,
    trace: context.events.map((event) => ({
      id: event.Id,
      runId: event.runId,
      timestamp: event.timestamp,
      author: event.author,
      content: JSON.parse(JSON.stringify(event.content)),
    })),
    error,
  });

  try {
    const question = staged
      ? `${problem.Question}\n\nThe attached file is available at ${staged.path}. Use the file tools from this temporary workspace to inspect it.`
      : problem.Question;
    const result = await createAgent().run(question, context);
    return evaluation(extractFinalAnswer(result.response));
  } catch (error) {
    return evaluation(
      "",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    if (staged) await rm(staged.directory, { recursive: true, force: true });
  }
}

/** Evaluates GAIA problems, each with its own agent so no history is shared between them. */
export async function runGaiaEvaluation(
  createAgent: AgentFactory,
  options: GaiaRunOptions,
): Promise<GaiaEvaluationReport> {
  const dataRoot = options.dataRoot ?? DEFAULT_DATA_ROOT;
  const all = await getGaiaProblems(options.level, {
    split: options.split,
    dataRoot,
  });
  const eligible = selectGaiaProblems(all, options).filter(
    (problem) => !options.taskId || problem.task_id === options.taskId,
  );
  const problems = eligible.slice(0, options.count);

  if (problems.length === 0) {
    throw new Error("No GAIA problems matched the requested options.");
  }

  const evaluations: GaiaEvaluation[] = [];
  let next = 0;
  const worker = async () => {
    while (next < problems.length) {
      const problem = problems[next++] as GaiaProblem;
      const evaluation = await evaluateProblem(
        createAgent,
        problem,
        dataRoot,
        options.split,
      );
      evaluations.push(evaluation);
      console.log(
        `${evaluation.correct ? "✓" : "✗"} ${problem.task_id.slice(0, 8)} answer=${JSON.stringify(evaluation.answer)} expected=${JSON.stringify(problem["Final answer"])}${evaluation.error ? ` error=${evaluation.error}` : ""}`,
      );
    }
  };
  await Promise.all(Array.from({ length: options.concurrency }, worker));

  return {
    options,
    skippedWithAttachments: all.length - eligible.length,
    evaluations,
  };
}
