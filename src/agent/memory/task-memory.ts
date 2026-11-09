

const TASK_MEMORY_EXTRACTION_PROMPT:string = `You are analyzing an agent's problem-solving record to extract a learning record.

Analyze the following execution history:

<execution_history>
{execution_history}
</execution_history>
`

export class TaskMemory {
    private readonly taskSummary: string;
    private readonly approach: string;
    private readonly finalAnswer: string;
    private readonly isCorrect: boolean;
    private readonly errorAnalysis: string|undefined;

    toEmbeddingText(): string {
        return `Task:${this.taskSummary}`
    }
}

const DUPLICATE_CHECK_PROMPT:string = `Compare the new memory against existing memories to determine if it's a duplicate.

Existing memories:
{existing_memories}

New memory:
{new_memory}

Respond with one of:
- ADD: This is new information that should be stored
- SKIP: Similar information already exists, no need to store

Judgment criteria:
- Same problem with different approach or different result counts as new information
- Same problem with same approach and same result is a duplicate`

class DuplicateCheckResult {
    decison: string;
    reason: string;
}