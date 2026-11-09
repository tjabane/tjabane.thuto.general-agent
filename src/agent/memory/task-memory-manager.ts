import { TaskMemory } from "./task-memory";
import { ExecutionContext } from "../models/agent-runtime";

export interface TaskMemoryManager {
    /**
     * Extract and save memory from execution context.
     * @params context contains all the events that happened in the current session
     * @returns memory_id if saved, None if ignored as duplicate
     */
    save(context: ExecutionContext): Promise<string | undefined>;
    
    /**
     * Search for memories related to the query.
     * @params query: user query
     * @params top_k: number of results to return at most
     * @returms A list of memories that match the query
     */
    search(query: string, top_k: number): Promise<TaskMemory[]>;
}