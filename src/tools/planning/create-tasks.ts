import { type ExecutionContext, Tool } from "@general-agent/agent";

type TaskStatus = "pending" | "in_progress" | "completed";

export type Task = {
  content: string;
  status: TaskStatus;
};

export type CreateTasksInput = {
  tasks: Task[];
};

function formatTask({ content, status }: Task): string {
  if (status === "pending") {
    return `[ ] ${content}`;
  }

  if (status === "in_progress") {
    return `[>] **${content}**`;
  }

  return `[x] ~~${content}~~`;
}

export class CreateTasksTool extends Tool<CreateTasksInput, string> {
  readonly name = "create_tasks";
  readonly description = `
    Create or update a task plan.

    WHEN TO USE:
    - Complex queries requiring multiple steps of research
    - Questions that need to combine information from different sources

    WHEN NOT TO USE:
    - Simple questions answerable with a single search
    - Tasks with obvious, straightforward procedures

    HOW TO USE:
    - Regenerate the entire task list with updated statuses
    - Mark completed tasks as 'completed'
    - Mark the next task to work on as 'in_progress'
    - Keep future tasks as 'pending'
  `;

  readonly parameters = {
    type: "object" as const,
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            content: { type: "string" },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed"],
            },
          },
          required: ["content", "status"],
          additionalProperties: false,
        },
      },
    },
    required: ["tasks"],
    additionalProperties: false,
  };

  readonly execute = async (
    _context: ExecutionContext,
    { tasks }: CreateTasksInput,
  ): Promise<string> => tasks.map(formatTask).join("\n");
}
