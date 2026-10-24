import type { Agent } from "../../src/agent/agent";
import { ToolCall } from "../../src/agent/models/agent";
import { ExecutionContext } from "../../src/agent/models/agent-runtime";
import { type GaiaLevel, getGaiaProblems } from "./gaia-dataset";
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
};

export type GaiaEvaluationReport = {
  options: GaiaRunOptions;
  skippedWithAttachments: number;
  evaluations: GaiaEvaluation[];
};

function toolCallNames(context: ExecutionContext): string[] {
  return context.events
    .map((event) => event.content)
    .filter((content) => content instanceof ToolCall)
    .map((toolCall) => toolCall.name);
}

/** Runs one problem with a fresh agent and scores its answer. */
async function evaluateProblem(
  createAgent: AgentFactory,
  problem: GaiaProblem,
): Promise<GaiaEvaluation> {
  const context = new ExecutionContext();
  const start = Date.now();
  const evaluation = (answer: string, error?: string): GaiaEvaluation => ({
    problem,
    answer,
    correct: isCorrectGaiaAnswer(answer, String(problem["Final answer"])),
    iterations: context.iteration,
    toolCalls: toolCallNames(context),
    durationMs: Date.now() - start,
    error,
  });

  try {
    const result = await createAgent().run(problem.Question, context);
    return evaluation(extractFinalAnswer(result.response));
  } catch (error) {
    return evaluation(
      "",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/** Evaluates GAIA problems, each with its own agent so no history is shared between them. */
export async function runGaiaEvaluation(
  createAgent: AgentFactory,
  options: GaiaRunOptions,
): Promise<GaiaEvaluationReport> {
  const all = await getGaiaProblems(options.level, { split: options.split });
  const eligible = options.includeAttachments
    ? all
    : all.filter((problem) => !problem.file_name);
  const problems = eligible.slice(0, options.count);

  if (problems.length === 0) {
    throw new Error("No GAIA problems matched the requested options.");
  }

  const evaluations: GaiaEvaluation[] = [];
  let next = 0;
  const worker = async () => {
    while (next < problems.length) {
      const problem = problems[next++] as GaiaProblem;
      const evaluation = await evaluateProblem(createAgent, problem);
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
