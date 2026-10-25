/** Context shared by the tools invoked during a single agent run. */
export interface ExecutionContext {
  readonly runId: string;
  readonly fileAccess?: {
    readonly allowedRoots?: string[];
    readonly maxFileBytes?: number;
    readonly maxOutputBytes?: number;
    readonly maxEntries?: number;
    readonly allowSymlinks?: boolean;
  };
}
