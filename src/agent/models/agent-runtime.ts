import { RandomUUID } from "node:crypto";
import type { OutputItem } from "./agent";


/**
 * Represents the execution context of a run. It contains a unique runId, a list of events that occur during the run,
 * the current iteration number, and the final result of the run. The runId is generated when the ExecutionContext is created,
 * and all events in the same run share the same runId.
 */
export class ExecutionContext {
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

    /**
     * Adds an event to the execution context. The event is created with the current runId, the author, and the content.
     * @param event The event to add to the execution context.
     */
    addEvent(event: Event): void {
        this.events.push(event);
    }

    /**
     * Increments the iteration number of the execution context. This is typically called when a new iteration of the run starts.
     */
    incrementIteration(): void {
        this.iteration++;
    }
}

/**
 * Represents an event in the execution context. its the base class for all events that occur during the execution of a run.
 * Each event has a unique ID, a timestamp, an author, and content that can be any arbitrary data. Events in the same run 
 * share the same runId, which is generated when the ExecutionContext is created.
 */
export class Event {
    readonly Id: string;
    readonly runId: string;
    readonly timestamp: number;
    readonly author: string;
    readonly content: OutputItem;

    constructor(runId: string, author: string, content: OutputItem) {
        this.Id = RandomUUID();
        this.timestamp = Date.now();
        this.runId = runId;
        this.author = author;
        this.content = content;
    }
}