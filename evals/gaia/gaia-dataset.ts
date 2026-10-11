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

const DEFAULT_DATA_ROOT = ".data/gaia/2023";

/** Reads GAIA problems for one level from the local Parquet dataset. */
export async function getGaiaProblems(
  level: GaiaLevel,
  count: number,
  {
    split = "validation",
    dataRoot = DEFAULT_DATA_ROOT,
  }: GaiaDatasetOptions = {},
): Promise<GaiaProblem[]> {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("GAIA problem count must be a positive integer.");
  }

  const path = `${dataRoot}/${split}/metadata.level${level}.parquet`;
  const file: AsyncBuffer = await asyncBufferFromFile(path);
  const problems = (await parquetReadObjects({ file })) as GaiaProblem[];

  return problems.slice(0, count);
}
