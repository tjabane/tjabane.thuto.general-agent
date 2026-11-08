import { Event } from "../models/agent-runtime";

export class Session {
  constructor(
    public readonly id: string,
    public readonly userId: string | undefined,
    public readonly events: Event[] = [],
    public readonly state: Record<string, any> = {},
    public readonly CreatedAt: number = Date.now() ,
    public UpdatedAt: number = CreatedAt ,
  ) {}
}