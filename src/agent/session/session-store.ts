import { randomUUID } from "node:crypto";
import { Session } from "./session";

abstract class SessionStore {
  abstract createSession(
    sessionId: string,
    userId: string | undefined,
  ): Promise<Session>;
  abstract saveSession(session: Session): Promise<void>;
  abstract getSession(sessionId: string): Promise<Session | null>;

  async getOrCreate(sessionId?: string, userId?: string): Promise<Session> {
    if (sessionId) {
      const existingSession = await this.getSession(sessionId);
      if (existingSession) return existingSession;
    }

    return this.createSession(sessionId ?? randomUUID(), userId);
  }
}

class InMemorySessionStore extends SessionStore {
  private sessions: Map<string, Session> = new Map();

  public async createSession(
    sessionId: string,
    userId: string | undefined,
  ): Promise<Session> {
    const session = new Session(sessionId, userId);
    this.sessions.set(sessionId, session);
    return session;
  }

  public async saveSession(session: Session): Promise<void> {
    this.sessions.set(session.id, session);
  }

  public async getSession(sessionId: string): Promise<Session | null> {
    return this.sessions.get(sessionId) ?? null;
  }
}

export { InMemorySessionStore, SessionStore };
