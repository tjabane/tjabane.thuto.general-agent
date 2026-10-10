import { RandomUUID } from "node:crypto";


/**
 * Represents the execution context of a run. It contains a unique runId, a list of events that occur during the run,
 * the current iteration number, and the final result of the run. The runId is generated when the ExecutionContext is created,
 * and all events in the same run share the same runId.
 */
class ExecutionContext {
    readonly runId: string;
    events: Event[];
    iteration: number;
    result: string | null;

    constructor() {
        this.runId = RandomUUID();
        this.events = [];
        this.iteration = 0;
        this.result = null;
    }
}

/**
 * Represents an event in the execution context. its the base class for all events that occur during the execution of a run.
 * Each event has a unique ID, a timestamp, an author, and content that can be any arbitrary data. Events in the same run 
 * share the same runId, which is generated when the ExecutionContext is created.
 */
class Event {
    readonly Id: string;
    readonly runId: string;
    readonly timestamp: number;
    readonly author: string;
    readonly content: Record<string, any>;

    constructor(runId: string, author: string, content: Record<string, any>) {
        this.Id = RandomUUID();
        this.timestamp = Date.now();
        this.runId = runId;
        this.author = author;
        this.content = content;
    }
}