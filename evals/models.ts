export type GaiaProblem = {
  task_id: string;
  Question: string;
  Level: 1 | 2 | 3;
  "Final answer": string;
  file_name: string | null;
  file_path: string | null;
};

export type GaiaOutput = {
  is_solvable: boolean;
  unsolvable_reason: string;
  final_answer: string;
};
