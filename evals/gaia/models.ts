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

// export const GaiaOutputSchema = z.object({
//   is_solvable: z.boolean(),
//   unsolvable_reason: z.string(),
//   final_answer: z.string(),
// });
