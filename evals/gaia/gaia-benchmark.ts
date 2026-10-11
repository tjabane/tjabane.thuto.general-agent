import type { Agent } from "../../src/agent/agent";
import { type GaiaLevel, getGaiaProblems } from "./gaia-dataset";
import type { GaiaOutput, GaiaProblem } from "./models";

export type AgentFactory = () => Agent;

export const GAIA_Prompt = `You are a general AI assistant. I will ask you a question. Report your thoughts, and finish your answer with the following template: FINAL ANSWER: [YOUR FINAL ANSWER].

YOUR FINAL ANSWER should be a number OR as few words as possible OR a comma separated list of numbers and/or strings.

If you are asked for a number, don't use comma to write your number neither use units such as $ or percent sign unless specified otherwise.

If you are asked for a string, don't use articles, neither abbreviations (e.g. for cities), and write the digits in plain text unless otherwise specified.

If you are asked for a comma separated list, apply the above rules depending of whether the element to be put in the list is a number or a string.`;

export type GaiaEvaluation = {
  metadata: GaiaProblem;
  output: GaiaOutput;
};

export type GaiaEvaluationReport = {
  dataset: {
    split: string;
    level: GaiaLevel;
  };
  requestedProblemCount: number;
  evaluatedProblemCount: number;
  evaluations: GaiaEvaluation[];
};

async function solveProblem(
  agent: Agent,
  problem: GaiaProblem,
): Promise<GaiaOutput> {
  try {
    return await agent.run(problem.Question);
  } catch (error) {
    return {
      is_solvable: false,
      unsolvable_reason:
        error instanceof Error ? error.message : "Unknown evaluation error.",
      final_answer: "",
    };
  }
}

/** Evaluates the requested GAIA problems without sharing conversation history between them. */
export async function runGaiaEvaluation(
  createAgent: AgentFactory,
  level: GaiaLevel = 1,
  count: number = 1,
): Promise<GaiaEvaluationReport> {
  const split = process.argv[2] ?? "validation";
  const problems = await getGaiaProblems(level, count, {
    split,
  });

  if (problems.length === 0) {
    throw new Error("No GAIA problems matched the requested level and count.");
  }

  const evaluations = await Promise.all(
    problems.map(async (problem) => ({
      metadata: problem,
      output: await solveProblem(createAgent(), problem),
    })),
  );

  return {
    dataset: { split, level },
    requestedProblemCount: count,
    evaluatedProblemCount: evaluations.length,
    evaluations,
  };
}
