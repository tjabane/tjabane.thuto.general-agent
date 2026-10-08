import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { asyncBufferFromUrl, parquetReadObjects } from "hyparquet";

import type { GaiaProblem } from "./evaluator";
import { runExperiment } from "./evaluator";

const problemLimit = 20;
const defaultModels = ["glm-5.3:cloud", "qwen3.5:9b"];
const resultsDirectory = resolve(import.meta.dir, "../../bench-results");
const datasetFileUrl =
  "https://huggingface.co/datasets/gaia-benchmark/GAIA/resolve/main/2023/validation/metadata.level1.parquet";

async function loadGaiaDataset(): Promise<GaiaProblem[]> {
  const token = Bun.env.HF_TOKEN;
  if (!token) {
    throw new Error("Set HF_TOKEN in the root .env file to access the gated GAIA dataset.");
  }

  const file = await asyncBufferFromUrl({
    url: datasetFileUrl,
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  return (await parquetReadObjects({
    file,
    columns: ["task_id", "Question", "Final answer"],
    rowEnd: problemLimit,
  })) as GaiaProblem[];
}

async function main(): Promise<void> {
  const models = Bun.argv.slice(2);

  if (models.length === 0) {
    models.push(...defaultModels);
  }

  const problems = await loadGaiaDataset();
  const results = await runExperiment(problems, models);
  const comparison = models.map((model) => {
    const evaluations = results[model] ?? [];
    const correct = evaluations.filter((evaluation) => evaluation.correct).length;
    const errors = evaluations.filter((evaluation) => evaluation.error).length;

    return {
      model,
      correct,
      total: evaluations.length,
      accuracy: evaluations.length === 0 ? 0 : correct / evaluations.length,
      errors,
    };
  });
  const completedAt = new Date().toISOString();
  const filename = `gaia-${completedAt.replaceAll(":", "-")}.json`;
  const resultPath = join(resultsDirectory, filename);

  await mkdir(resultsDirectory, { recursive: true });
  await Bun.write(
    resultPath,
    JSON.stringify({ completedAt, comparison, results }, null, 2),
  );

  console.table(comparison.map((result) => ({
    Model: result.model,
    Correct: `${result.correct}/${result.total}`,
    Accuracy: `${(result.accuracy * 100).toFixed(1)}%`,
    Errors: result.errors,
  })));
  console.log(`Detailed results written to ${resultPath}`);
}

await main();
