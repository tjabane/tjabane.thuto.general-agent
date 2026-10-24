import {
  type AsyncBuffer,
  asyncBufferFromFile,
  parquetReadObjects,
} from "hyparquet";
import type { GaiaProblem } from "./models";

export type GaiaLevel = 1 | 2 | 3;

export type GaiaDatasetOptions = {
  split?: string;
  dataRoot?: string;
};

export const DEFAULT_DATA_ROOT = ".data/gaia/2023";

/** Reads all GAIA problems for one level from the local Parquet dataset. */
export async function getGaiaProblems(
  level: GaiaLevel,
  {
    split = "validation",
    dataRoot = DEFAULT_DATA_ROOT,
  }: GaiaDatasetOptions = {},
): Promise<GaiaProblem[]> {
  const path = `${dataRoot}/${split}/metadata.level${level}.parquet`;
  if (!(await Bun.file(path).exists())) {
    throw new Error(
      `GAIA dataset not found at ${path}. Run \`bun run gaia:download ${split}\` first.`,
    );
  }

  const file: AsyncBuffer = await asyncBufferFromFile(path);
  return (await parquetReadObjects({ file })) as GaiaProblem[];
}
