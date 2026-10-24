import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { DEFAULT_DATA_ROOT } from "./gaia-dataset";

const REPO_URL = "https://huggingface.co/datasets/gaia-benchmark/GAIA";
const TREE_URL =
  "https://huggingface.co/api/datasets/gaia-benchmark/GAIA/tree/main";

type TreeEntry = { type: "file" | "directory"; path: string };

/** Downloads one GAIA split (metadata and attachments) into .data/gaia. */
async function downloadSplit(split: string, token: string): Promise<void> {
  const response = await fetch(`${TREE_URL}/2023/${split}`);
  if (!response.ok) {
    throw new Error(`Listing GAIA ${split} failed with ${response.status}.`);
  }

  const files = ((await response.json()) as TreeEntry[]).filter(
    (entry) => entry.type === "file",
  );

  for (const { path } of files) {
    const target = `${dirname(DEFAULT_DATA_ROOT)}/${path}`;
    if (await Bun.file(target).exists()) {
      continue;
    }

    const file = await fetch(`${REPO_URL}/resolve/main/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!file.ok) {
      throw new Error(
        `Downloading ${path} failed with ${file.status}. Check HF_TOKEN and that you accepted the GAIA terms on Hugging Face.`,
      );
    }

    await mkdir(dirname(target), { recursive: true });
    await Bun.write(target, file);
    console.log(`Downloaded ${path}`);
  }

  console.log(
    `GAIA ${split}: ${files.length} files in ${DEFAULT_DATA_ROOT}/${split}`,
  );
}

if (import.meta.main) {
  const token = process.env.HF_TOKEN;
  if (!token) {
    throw new Error(
      "HF_TOKEN is not set. Create one at https://huggingface.co/settings/tokens.",
    );
  }

  await downloadSplit(process.argv[2] ?? "validation", token);
}
