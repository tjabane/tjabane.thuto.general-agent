import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  hasGaiaAttachment,
  selectGaiaProblems,
  stageGaiaAttachment,
} from "../../evals/gaia/gaia-benchmark";
import type { GaiaProblem } from "../../evals/gaia/models";

const problem = (fileName: string | null): GaiaProblem => ({
  task_id: fileName ?? "no-file",
  Question: "Question",
  Level: 1,
  "Final answer": "answer",
  file_name: fileName,
  file_path: fileName ? `2023/validation/${fileName}` : null,
});

describe("GAIA attachment evaluation", () => {
  let temporaryRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryRoots.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
    temporaryRoots = [];
  });

  test("selects only attachment problems", () => {
    const problems = [problem("document.txt"), problem(null)];

    expect(
      selectGaiaProblems(problems, {
        includeAttachments: false,
        attachmentsOnly: true,
      }),
    ).toEqual([problems[0]]);
    expect(hasGaiaAttachment(problems[0] as GaiaProblem)).toBe(true);
    expect(hasGaiaAttachment(problems[1] as GaiaProblem)).toBe(false);
  });

  test("copies an attachment into an isolated temporary folder", async () => {
    const dataParent = await mkdtemp(path.join(os.tmpdir(), "gaia-data-"));
    temporaryRoots.push(dataParent);
    const dataRoot = path.join(dataParent, "2023");
    const source = path.join(dataRoot, "validation");
    await mkdir(source, { recursive: true });
    await Bun.write(path.join(source, "document.txt"), "attachment contents");

    const staged = await stageGaiaAttachment(
      problem("document.txt"),
      dataRoot,
      "validation",
    );
    temporaryRoots.push(staged.directory);

    expect(staged.directory).not.toBe(source);
    await expect(readFile(staged.path, "utf8")).resolves.toBe(
      "attachment contents",
    );
  });
});
