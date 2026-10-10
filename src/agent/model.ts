import { z } from "zod";

export type Role = "user" | "assistant" | "system";
export type Message = {
  role: Role;
  content: string;
};

export const GaiaOutputSchema = z.object({
  is_solvable: z.boolean(),
  unsolvable_reason: z.string(),
  final_answer: z.string(),
});

export type GaiaOutput = z.infer<typeof GaiaOutputSchema>;
