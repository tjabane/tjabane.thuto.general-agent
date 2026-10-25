export type MediaKind = "image" | "audio" | "pdf";

export type MediaAnalysis = {
  analysis: string;
  model?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};

export type MediaAnalysisRequest = {
  data: Uint8Array;
  mediaType: string;
  filename: string;
  prompt: string;
  kind: MediaKind;
};

export interface MediaAnalyzer {
  analyze(request: MediaAnalysisRequest): Promise<MediaAnalysis>;
}

type OpenAIResponse = {
  model?: string;
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

type OpenAITranscription = { text?: string };

function extractOutputText(response: OpenAIResponse): string {
  if (response.output_text?.trim()) return response.output_text;

  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && item.text)
    .map((item) => item.text as string)
    .join("\n");
}

export type OpenAIMediaAnalyzerOptions = {
  apiKey?: string;
  model?: string;
  transcriptionModel?: string;
  fetch?: typeof fetch;
};

export class OpenAIMediaAnalyzer implements MediaAnalyzer {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly transcriptionModel: string;
  private readonly fetch: typeof fetch;

  constructor(options: OpenAIMediaAnalyzerOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.model = options.model ?? process.env.OPENAI_MEDIA_MODEL ?? "gpt-4o";
    this.transcriptionModel =
      options.transcriptionModel ??
      process.env.OPENAI_TRANSCRIPTION_MODEL ??
      "gpt-4o-mini-transcribe";
    this.fetch = options.fetch ?? fetch;
  }

  async analyze(request: MediaAnalysisRequest): Promise<MediaAnalysis> {
    if (!this.apiKey) throw new Error("OPENAI_API_KEY is not set.");
    if (request.kind === "audio") {
      const transcript = await this.transcribe(request);
      return this.complete(`Audio transcript:\n${transcript}`, request.prompt);
    }

    const data = Buffer.from(request.data).toString("base64");
    const content =
      request.kind === "image"
        ? [
            { type: "input_text", text: request.prompt },
            {
              type: "input_image",
              image_url: `data:${request.mediaType};base64,${data}`,
            },
          ]
        : [
            { type: "input_text", text: request.prompt },
            {
              type: "input_file",
              filename: request.filename,
              file_data: `data:${request.mediaType};base64,${data}`,
            },
          ];
    return this.complete(content);
  }

  private async transcribe(request: MediaAnalysisRequest): Promise<string> {
    const form = new FormData();
    form.append("model", this.transcriptionModel);
    form.append(
      "file",
      new Blob([request.data], { type: request.mediaType }),
      request.filename,
    );
    const response = await this.fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
      },
    );
    if (!response.ok)
      throw new Error(
        `OpenAI transcription failed with ${response.status}: ${await response.text()}`,
      );
    const result = (await response.json()) as OpenAITranscription;
    if (!result.text) throw new Error("OpenAI transcription returned no text.");
    return result.text;
  }

  private async complete(
    input: unknown,
    prompt?: string,
  ): Promise<MediaAnalysis> {
    const response = await this.fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        instructions: prompt,
        input: [{ role: "user", content: input }],
      }),
    });
    if (!response.ok)
      throw new Error(
        `OpenAI media analysis failed with ${response.status}: ${await response.text()}`,
      );
    const result = (await response.json()) as OpenAIResponse;
    const analysis = extractOutputText(result);
    if (!analysis) throw new Error("OpenAI media analysis returned no text.");
    return {
      analysis,
      model: result.model ?? this.model,
      usage: {
        inputTokens: result.usage?.input_tokens,
        outputTokens: result.usage?.output_tokens,
      },
    };
  }
}
