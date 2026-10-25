import path from "node:path";
import { type ExecutionContext, Tool } from "@general-agent/agent";
import {
  getFileAccessPolicy,
  mediaTypeFor,
  resolveAllowedPath,
  truncateText,
} from "./file-types";
import { defaultFileServices, type FileServices } from "./services";

export type ReadFileInput = {
  path: string;
  sheet?: string;
  range?: string;
};

export type ReadFileOutput = {
  path: string;
  mediaType: string;
  format: "text" | "csv" | "excel";
  content:
    | string
    | {
        pages?: Array<{ page: number; text: string }>;
        sheets?: Array<{ name: string; rows: unknown[][] }>;
      };
  truncated: boolean;
};

function parseCsv(value: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (character === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export class ReadFileTool extends Tool<ReadFileInput, ReadFileOutput> {
  constructor(private readonly services: FileServices = defaultFileServices) {
    super();
  }

  readonly name = "read_file";
  readonly description = "Read text, CSV, and Microsoft Excel files.";
  readonly parameters = {
    type: "object" as const,
    properties: {
      path: { type: "string", description: "Path to the file." },
      sheet: { type: "string", description: "Excel sheet name." },
      range: {
        type: "string",
        description: "Excel range, for example A1:D20.",
      },
    },
    required: ["path"],
    additionalProperties: false,
  };

  readonly execute = async (
    context: ExecutionContext,
    input: ReadFileInput,
  ): Promise<ReadFileOutput> => {
    const policy = getFileAccessPolicy(context);
    const filesystem = this.services.filesystem;
    const filePath = await resolveAllowedPath(input.path, policy, filesystem);
    const fileStats = await filesystem.stat(filePath);
    if (fileStats.size > policy.maxFileBytes)
      throw new Error(`File exceeds the ${policy.maxFileBytes}-byte limit.`);

    const mediaType = mediaTypeFor(filePath);
    const extension = path.extname(filePath).toLowerCase();
    if (extension === ".pdf")
      throw new Error("PDF files must be analyzed with read_media.");
    if ([".xls", ".xlsx", ".xlsm"].includes(extension))
      return this.readExcel(filePath, mediaType, input, filesystem);

    const text = new TextDecoder().decode(await filesystem.readFile(filePath));
    const isCsv =
      extension === ".csv" || extension === ".tsv" || mediaType === "text/csv";
    if (isCsv) {
      const rows = parseCsv(text, extension === ".tsv" ? "\t" : ",");
      const serialized = JSON.stringify(rows);
      const result = truncateText(serialized, policy.maxOutputBytes);
      return {
        path: filePath,
        mediaType,
        format: "csv",
        content: result.content,
        truncated: result.truncated,
      };
    }
    const result = truncateText(text, policy.maxOutputBytes);
    return {
      path: filePath,
      mediaType,
      format: "text",
      content: result.content,
      truncated: result.truncated,
    };
  };

  private async readExcel(
    filePath: string,
    mediaType: string,
    input: ReadFileInput,
    filesystem: FileServices["filesystem"],
  ): Promise<ReadFileOutput> {
    const sheets = this.services.excel.read(
      await filesystem.readFile(filePath),
      input,
    );
    return {
      path: filePath,
      mediaType,
      format: "excel",
      content: { sheets },
      truncated: false,
    };
  }
}
