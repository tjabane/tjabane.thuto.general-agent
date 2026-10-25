import path from "node:path";
import { type ExecutionContext, Tool } from "@general-agent/agent";
import {
  type MediaAnalyzer,
  type MediaKind,
  OpenAIMediaAnalyzer,
} from "@general-agent/services";
import { getFileAccessPolicy, resolveAllowedPath } from "./support/file-types";
import {
  defaultFileServices,
  type FileSystemService,
} from "./support/services";

export type ReadMediaInput = {
  path: string;
  prompt?: string;
  pages?: number[];
};

export type ReadMediaOutput = {
  path: string;
  mediaType: MediaKind;
  analysis: string;
  model?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};

export type ReadMediaServices = {
  filesystem: FileSystemService;
  analyzer: MediaAnalyzer;
};

function mediaInfo(filePath: string): { kind: MediaKind; type: string } {
  const extension = path.extname(filePath).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extension)) {
    return {
      kind: "image",
      type:
        extension === ".jpg" || extension === ".jpeg"
          ? "image/jpeg"
          : `image/${extension.slice(1)}`,
    };
  }
  if (
    [
      ".mp3",
      ".wav",
      ".m4a",
      ".mp4",
      ".mpeg",
      ".webm",
      ".ogg",
      ".flac",
    ].includes(extension)
  ) {
    return { kind: "audio", type: `audio/${extension.slice(1)}` };
  }
  if (extension === ".pdf") return { kind: "pdf", type: "application/pdf" };
  throw new Error(`Unsupported media type: ${extension || "unknown"}`);
}

export class ReadMediaTool extends Tool<ReadMediaInput, ReadMediaOutput> {
  readonly name = "read_media";
  readonly description = "Analyze image, audio, and PDF files using an LLM.";
  readonly parameters = {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description: "Path to an image, audio, or PDF file.",
      },
      prompt: {
        type: "string",
        description: "Question or analysis instruction.",
      },
      pages: {
        type: "array",
        items: { type: "number" },
        description: "PDF pages to focus on.",
      },
    },
    required: ["path", "prompt", "pages"],
    additionalProperties: false,
  };

  constructor(
    private readonly services: ReadMediaServices = {
      filesystem: defaultFileServices.filesystem,
      analyzer: new OpenAIMediaAnalyzer(),
    },
  ) {
    super();
  }

  readonly execute = async (
    context: ExecutionContext,
    input: ReadMediaInput,
  ): Promise<ReadMediaOutput> => {
    const policy = getFileAccessPolicy(context);
    const filePath = await resolveAllowedPath(
      input.path,
      policy,
      this.services.filesystem,
    );
    const stats = await this.services.filesystem.stat(filePath);
    if (stats.size > policy.maxFileBytes)
      throw new Error(`File exceeds the ${policy.maxFileBytes}-byte limit.`);
    const info = mediaInfo(filePath);
    const prompt =
      input.prompt?.trim() ||
      "Describe and analyze this file. Include important details, uncertainty, and any useful extracted information.";
    const pagePrompt =
      info.kind === "pdf" && input.pages?.length
        ? `${prompt}\nFocus on PDF pages: ${input.pages.join(", ")}.`
        : prompt;
    const result = await this.services.analyzer.analyze({
      data: await this.services.filesystem.readFile(filePath),
      mediaType: info.type,
      filename: path.basename(filePath),
      prompt: pagePrompt,
      kind: info.kind,
    });
    return { path: filePath, mediaType: info.kind, ...result };
  };
}
