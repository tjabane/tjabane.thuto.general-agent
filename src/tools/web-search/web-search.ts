import { type ExecutionContext, Tool } from "@general-agent/agent";

export type WebSearchInput = {
  query: string;
};

export type WebSearchResult = {
  title: string;
  url: string;
  content: string;
};

export type WebSearchOptions = {
  apiKey?: string;
  maxResults?: number;
  fetch?: typeof fetch;
};

type TavilySearchResponse = {
  results: { title: string; url: string; content: string }[];
};

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

/** Searches the web through the Tavily Search API. */
export class WebSearchTool extends Tool<WebSearchInput, WebSearchResult[]> {
  readonly name = "web_search";
  readonly description =
    "Search the web for current information on any topic. Use for news, facts, or data beyond your knowledge cutoff. Returns content excerpts and source URLs.";
  readonly parameters = {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description:
          "The search query, for example: population of Lesotho 2020.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  };

  private readonly apiKey: string | undefined;
  private readonly maxResults: number;
  private readonly fetch: typeof fetch;

  constructor(options: WebSearchOptions = {}) {
    super();
    this.apiKey = options.apiKey ?? process.env.TAVILY_API_KEY;
    this.maxResults = options.maxResults ?? 5;
    this.fetch = options.fetch ?? fetch;
  }

  readonly execute = async (
    _context: ExecutionContext,
    { query }: WebSearchInput,
  ): Promise<WebSearchResult[]> => {
    if (query.trim() === "") {
      throw new Error("A search query is required.");
    }

    if (!this.apiKey) {
      throw new Error("TAVILY_API_KEY is not set.");
    }

    const response = await this.fetch(TAVILY_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ query, max_results: this.maxResults }),
    });

    if (!response.ok) {
      throw new Error(
        `Tavily search failed with ${response.status}: ${await response.text()}`,
      );
    }

    const data = (await response.json()) as TavilySearchResponse;

    return data.results.map(({ title, url, content }) => ({
      title,
      url,
      content,
    }));
  };
}
