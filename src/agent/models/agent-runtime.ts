import { randomUUID } from "node:crypto";
import type { OutputItem } from "./agent";
import type { Session } from "../session/session";
import type { SessionStore } from "../session/session-store";

/**
 * Represents the execution context of a run. It contains a unique runId, a list of events that occur during the run,
 * the current iteration number, and the final result of the run. The runId is generated when the ExecutionContext is created,
 * and all events in the same run share the same runId.
 */
export class ExecutionContext {
  readonly runId: string;
  readonly session: Session | null = null;
  readonly sessionStore: SessionStore | null = null;
  readonly fileAccess?: {
    readonly allowedRoots?: string[];
    readonly maxFileBytes?: number;
    readonly maxOutputBytes?: number;
    readonly maxEntries?: number;
    readonly allowSymlinks?: boolean;
  };
  events: Event[];
  iteration: number;
  result: string | null;

  constructor(session: Session|null, sessionStore:SessionStore,  options: { fileAccess?: ExecutionContext["fileAccess"] } = {}) {
    this.runId = randomUUID();
    this.fileAccess = options.fileAccess;
    this.events = [];
    this.iteration = 0;
    this.result = null;
    this.session = session;
    this.sessionStore = sessionStore;
  }

  /**
   * Returns the current state of the execution context. If a session is associated with the execution context, it returns the state from the session; otherwise, it returns an empty object.
   * @returns any The current state of the execution context.
   */
  getState(): any {
    if(this.session) {
      return this.session.state;
    }
    return {};
  }

  /**
   * Returns the list of events that have occurred during the execution of the run. If a session is associated with the execution context, it returns the events from the session; otherwise, it returns an empty array.
   * @returns Event[] The list of events that have occurred during the execution of the run.
   */
  getEvents(): Event[] {
    if(this.session) {
      return this.session.events;
    }
    return [];
  }

  /**
   * Adds an event to the execution context. The event is created with the current runId, the author, and the content.
   * @param event The event to add to the execution context.
   */
  addEvent(event: Event): void {
    if(this.session) {
      this.session.events.push(event);
      this.session.UpdatedAt = Date.now();
    }
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
  readonly content: OutputItem | OutputItem[];

  constructor(
    runId: string,
    author: string,
    content: OutputItem | OutputItem[],
  ) {
    this.Id = randomUUID();
    this.timestamp = Date.now();
    this.runId = runId;
    this.author = author;
    this.content = content;
  }
}

export class AgentResult {
  readonly response: string;
  readonly context: ExecutionContext;

  constructor(response: string, context: ExecutionContext) {
    this.response = response;
    this.context = context;
  }
}
