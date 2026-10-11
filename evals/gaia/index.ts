import { Agent } from "../../src/agent/agent";
import type { LLMClient } from "../../src/agent/clients/llm-client";
import { OpenAIClient } from "../../src/agent/clients/openai-client";
import {
  type AgentFactory,
  GAIA_Prompt,
  type GaiaEvaluationReport,
  runGaiaEvaluation,
} from "./gaia-benchmark";

type Benchmark<TReport> = (createAgent: AgentFactory) => Promise<TReport>;

type GaiaPerformance = {
  totalProblems: number;
  answerMatches: number;
  answerAccuracy: string;
  solvabilityMatches: number;
  solvabilityAccuracy: string;
};

function createOpenAIAgent(): Agent {
  const client: LLMClient = new OpenAIClient(GAIA_Prompt, "gpt-5-mini");
  return new Agent(client);
}

async function runBenchmark<TReport>(
  benchmark: Benchmark<TReport>,
  createAgent: AgentFactory,
): Promise<TReport> {
  return benchmark(createAgent);
}

function normalizeAnswer(answer: string): string {
  return answer.trim().toLocaleLowerCase();
}

function calculateGaiaPerformance(
  report: GaiaEvaluationReport,
): GaiaPerformance {
  const totalProblems = report.evaluations.length;
  const answerMatches = report.evaluations.filter(
    ({ metadata, output }) =>
      normalizeAnswer(String(metadata["Final answer"])) ===
      normalizeAnswer(output.final_answer),
  ).length;
  const solvabilityMatches = report.evaluations.filter(
    ({ output }) => output.is_solvable,
  ).length;

  return {
    totalProblems,
    answerMatches,
    answerAccuracy: `${((answerMatches / totalProblems) * 100).toFixed(1)}%`,
    solvabilityMatches,
    solvabilityAccuracy: `${((solvabilityMatches / totalProblems) * 100).toFixed(1)}%`,
  };
}

if (import.meta.main) {
  const report = await runBenchmark(
    (createAgent) => runGaiaEvaluation(createAgent, 1, 5),
    createOpenAIAgent,
  );
  console.table([calculateGaiaPerformance(report)]);
}
