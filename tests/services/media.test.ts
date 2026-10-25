import { describe, expect, test } from "bun:test";
import {
  type MediaAnalysisRequest,
  OpenAIMediaAnalyzer,
} from "../../src/services/media";

function fakeFetch(responses: Response[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const response = responses.shift();
    if (!response) throw new Error("Unexpected fetch call.");
    return response;
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const baseRequest: MediaAnalysisRequest = {
  data: new TextEncoder().encode("media-bytes"),
  mediaType: "image/png",
  filename: "diagram.png",
  prompt: "Describe this image.",
  kind: "image",
};

describe("OpenAIMediaAnalyzer", () => {
  test("sends image data to the Responses API", async () => {
    const { fetch, calls } = fakeFetch([
      Response.json({
        model: "vision-model",
        output_text: "A diagram.",
        usage: { input_tokens: 10, output_tokens: 4 },
      }),
    ]);
    const analyzer = new OpenAIMediaAnalyzer({ apiKey: "test-key", fetch });

    await expect(analyzer.analyze(baseRequest)).resolves.toEqual({
      analysis: "A diagram.",
      model: "vision-model",
      usage: { inputTokens: 10, outputTokens: 4 },
    });

    expect(calls[0]?.url).toBe("https://api.openai.com/v1/responses");
    expect(calls[0]?.init?.headers).toEqual({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    });
    const body = JSON.parse(calls[0]?.init?.body as string);
    expect(body.input[0].content).toEqual([
      { type: "input_text", text: "Describe this image." },
      {
        type: "input_image",
        image_url: "data:image/png;base64,bWVkaWEtYnl0ZXM=",
      },
    ]);
  });

  test("sends PDFs as input files", async () => {
    const { fetch, calls } = fakeFetch([
      Response.json({ output_text: "A document." }),
    ]);
    const analyzer = new OpenAIMediaAnalyzer({ apiKey: "test-key", fetch });

    await expect(
      analyzer.analyze({
        ...baseRequest,
        kind: "pdf",
        mediaType: "application/pdf",
        filename: "report.pdf",
      }),
    ).resolves.toMatchObject({ analysis: "A document." });

    const body = JSON.parse(calls[0]?.init?.body as string);
    expect(body.input[0].content[1]).toEqual({
      type: "input_file",
      filename: "report.pdf",
      file_data: "data:application/pdf;base64,bWVkaWEtYnl0ZXM=",
    });
  });

  test("transcribes audio before analyzing the transcript", async () => {
    const { fetch, calls } = fakeFetch([
      Response.json({ text: "The speaker said hello." }),
      Response.json({ output_text: "The recording contains a greeting." }),
    ]);
    const analyzer = new OpenAIMediaAnalyzer({
      apiKey: "test-key",
      transcriptionModel: "transcription-model",
      model: "analysis-model",
      fetch,
    });

    await expect(
      analyzer.analyze({
        ...baseRequest,
        kind: "audio",
        mediaType: "audio/wav",
        filename: "recording.wav",
        prompt: "Summarize the recording.",
      }),
    ).resolves.toMatchObject({
      analysis: "The recording contains a greeting.",
    });

    expect(calls[0]?.url).toBe(
      "https://api.openai.com/v1/audio/transcriptions",
    );
    const form = calls[0]?.init?.body as FormData;
    expect(form.get("model")).toBe("transcription-model");
    expect((form.get("file") as File).name).toBe("recording.wav");
    expect(calls[1]?.url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(calls[1]?.init?.body as string);
    expect(body.model).toBe("analysis-model");
    expect(body.instructions).toBe("Summarize the recording.");
    expect(body.input[0].content).toBe(
      "Audio transcript:\nThe speaker said hello.",
    );
  });

  test("rejects missing credentials", async () => {
    const analyzer = new OpenAIMediaAnalyzer({ apiKey: "" });

    await expect(analyzer.analyze(baseRequest)).rejects.toThrow(
      "OPENAI_API_KEY is not set.",
    );
  });

  test("surfaces API errors", async () => {
    const { fetch } = fakeFetch([new Response("Bad request", { status: 400 })]);
    const analyzer = new OpenAIMediaAnalyzer({ apiKey: "test-key", fetch });

    await expect(analyzer.analyze(baseRequest)).rejects.toThrow(
      "OpenAI media analysis failed with 400: Bad request",
    );
  });
});
