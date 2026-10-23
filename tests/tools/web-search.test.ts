import { describe, expect, test } from "bun:test";
import { WebSearchTool } from "../../src/tools";

const context = { runId: "test-run" };

function fakeFetch(response: Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return response;
  }) as unknown as typeof globalThis.fetch;

  return { fetch, calls };
}

describe("WebSearchTool", () => {
  test("sends the query to Tavily and maps the results", async () => {
    const { fetch, calls } = fakeFetch(
      Response.json({
        results: [
          {
            title: "Example",
            url: "https://example.com",
            content: "Example content",
            score: 0.9,
          },
        ],
      }),
    );
    const tool = new WebSearchTool({
      apiKey: "test-key",
      maxResults: 3,
      fetch,
    });

    await expect(tool.execute(context, { query: "example" })).resolves.toEqual([
      {
        title: "Example",
        url: "https://example.com",
        content: "Example content",
      },
    ]);

    expect(calls[0]?.url).toBe("https://api.tavily.com/search");
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({
      query: "example",
      max_results: 3,
    });
    expect(
      (calls[0]?.init?.headers as Record<string, string> | undefined)
        ?.Authorization,
    ).toBe("Bearer test-key");
  });

  test("rejects an empty query", async () => {
    const tool = new WebSearchTool({ apiKey: "test-key" });

    await expect(tool.execute(context, { query: "  " })).rejects.toThrow(
      "A search query is required.",
    );
  });

  test("rejects a missing API key", async () => {
    const tool = new WebSearchTool({ apiKey: "" });

    await expect(tool.execute(context, { query: "example" })).rejects.toThrow(
      "TAVILY_API_KEY is not set.",
    );
  });

  test("surfaces Tavily errors", async () => {
    const { fetch } = fakeFetch(new Response("Unauthorized", { status: 401 }));
    const tool = new WebSearchTool({ apiKey: "bad-key", fetch });

    await expect(tool.execute(context, { query: "example" })).rejects.toThrow(
      "Tavily search failed with 401: Unauthorized",
    );
  });
});
