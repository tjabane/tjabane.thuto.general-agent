export type GaiaProblem = {
  task_id: string;
  Question: string;
  Level: 1 | 2 | 3;
  "Final answer": string;
  file_name: string | null;
  file_path: string | null;
};

export type GaiaEvaluation = {
  problem: GaiaProblem;
  answer: string;
  correct: boolean;
  iterations: number;
  toolCalls: string[];
  durationMs: number;
  trace: Array<{
    id: string;
    runId: string;
    timestamp: number;
    author: string;
    content: unknown;
  }>;
  error?: string;
};
