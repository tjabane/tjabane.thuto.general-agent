import OpenAI from "openai";

import type { GaiaOutput } from "./models";

const apiKey = Bun.env.OLLAMA_API_KEY;

if (!apiKey) {
  throw new Error("Set OLLAMA_API_KEY in the root .env file before running benchmarks.");
}

const client = new OpenAI({
  apiKey,
  baseURL: Bun.env.OLLAMA_BASE_URL ?? "https://ollama.com/v1",
  maxRetries: 2,
});

const gaiaPrompt = `You solve GAIA benchmark problems. Return only JSON matching the provided schema.
Set is_solvable to false and explain why in unsolvable_reason when the problem cannot be solved.
Otherwise, put the answer in final_answer and leave unsolvable_reason empty.`;

class Semaphore {
  private available: number;
  private readonly waiting: Array<() => void> = [];

  constructor(limit: number) {
    this.available = limit;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.available > 0) {
      this.available -= 1;
      return Promise.resolve();
    }

    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) {
      next();
    } else {
      this.available += 1;
    }
  }
}

const providerSemaphores = new Map<string, Semaphore>();

function getProvider(model: string): string {
  return model.split("/", 1)[0] || "ollama";
}

function getProviderSemaphore(provider: string): Semaphore {
  let semaphore = providerSemaphores.get(provider);
  if (!semaphore) {
    semaphore = new Semaphore(4);
    providerSemaphores.set(provider, semaphore);
  }
  return semaphore;
}

/** Solve a single problem and return structured output. */
export async function solveProblem(
  model: string,
  question: string,
): Promise<GaiaOutput> {
  const provider = getProvider(model);

  return getProviderSemaphore(provider).run(async () => {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: gaiaPrompt },
        { role: "user", content: question },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "gaia_output",
          strict: true,
          schema: {
            type: "object",
            properties: {
              is_solvable: { type: "boolean" },
              unsolvable_reason: { type: "string" },
              final_answer: { type: "string" },
            },
            required: ["is_solvable", "unsolvable_reason", "final_answer"],
            additionalProperties: false,
          },
        },
      },
    });

    const choice = response.choices[0];
    const finishReason = String(choice?.finish_reason ?? "unknown");
    const content = choice?.message.content;

    if (finishReason === "refusal" || choice?.message.refusal || !content) {
      return {
        is_solvable: false,
        unsolvable_reason: `Model refused to answer (finish_reason: ${finishReason})`,
        final_answer: "",
      };
    }

    return JSON.parse(content) as GaiaOutput;
  });
}

export type GaiaProblem = {
  task_id: string;
  Question: string;
  "Final answer": string;
};

export type GaiaEvaluation = {
  task_id: string;
  model: string;
  correct: boolean;
  is_solvable: boolean | null;
  prediction: string | null;
  answer: string;
  unsolvable_reason?: string;
  error?: string;
};

export function isCorrect(prediction: string, answer: string): boolean {
  return prediction.trim().toLowerCase() === answer.trim().toLowerCase();
}

/** Evaluate a single problem-model pair and return the result. */
export async function evaluateGaiaSingle(
  problem: GaiaProblem,
  model: string,
): Promise<GaiaEvaluation> {
  try {
    const output = await solveProblem(model, problem.Question);
    const prediction = output.final_answer ?? "";

    return {
      task_id: problem.task_id,
      model,
      correct: isCorrect(prediction, problem["Final answer"]),
      is_solvable: output.is_solvable,
      prediction,
      answer: problem["Final answer"],
      unsolvable_reason: output.unsolvable_reason ?? "",
    };
  } catch (error) {
    return {
      task_id: problem.task_id,
      model,
      correct: false,
      is_solvable: null,
      prediction: null,
      answer: problem["Final answer"],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Evaluate every requested model against every supplied GAIA problem. */
export async function runExperiment(
  problems: GaiaProblem[],
  models: string[],
): Promise<Record<string, GaiaEvaluation[]>> {
  const tasks = problems.flatMap((problem) =>
    models.map((model) => evaluateGaiaSingle(problem, model)),
  );
  const allResults = await Promise.all(tasks);
  const results: Record<string, GaiaEvaluation[]> = Object.fromEntries(
    models.map((model) => [model, []]),
  );

  for (const result of allResults) {
    (results[result.model] ??= []).push(result);
  }

  return results;
}
