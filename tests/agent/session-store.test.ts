import { describe, expect, test } from "bun:test";
import { InMemorySessionStore } from "../../src/agent/session/session-store";

describe("InMemorySessionStore", () => {
  test("creates a session with a UUID when no ID is supplied", async () => {
    const store = new InMemorySessionStore();

    const session = await store.getOrCreate();

    expect(session.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(await store.getSession(session.id)).toBe(session);
  });

  test("creates a missing session with the supplied ID", async () => {
    const store = new InMemorySessionStore();

    const session = await store.getOrCreate("conversation-1", "user-1");

    expect(session.id).toBe("conversation-1");
    expect(session.userId).toBe("user-1");
  });

  test("returns an existing session", async () => {
    const store = new InMemorySessionStore();
    const existing = await store.createSession("conversation-1", "user-1");

    const session = await store.getOrCreate("conversation-1", "user-2");

    expect(session).toBe(existing);
    expect(session.userId).toBe("user-1");
  });
});
