import path from "node:path";
import { type ExecutionContext, Tool } from "@general-agent/agent";
import { getFileAccessPolicy, resolveAllowedPath } from "./file-types";
import { defaultFileServices, type FileServices } from "./services";

export type UnzipInput = {
  archivePath: string;
  destinationPath?: string;
  overwrite?: boolean;
};

export type UnzipOutput = {
  destinationPath: string;
  files: Array<{ path: string; size: number }>;
};

export class UnzipTool extends Tool<UnzipInput, UnzipOutput> {
  constructor(private readonly services: FileServices = defaultFileServices) {
    super();
  }

  readonly name = "unzip";
  readonly description = "Extract a ZIP archive into an allowed directory.";
  readonly parameters = {
    type: "object" as const,
    properties: {
      archivePath: { type: "string", description: "Path to a ZIP archive." },
      destinationPath: { type: "string", description: "Extraction directory." },
      overwrite: { type: "boolean", description: "Overwrite existing files." },
    },
    required: ["archivePath"],
    additionalProperties: false,
  };

  readonly execute = async (
    context: ExecutionContext,
    input: UnzipInput,
  ): Promise<UnzipOutput> => {
    const policy = getFileAccessPolicy(context);
    const filesystem = this.services.filesystem;
    const archivePath = await resolveAllowedPath(
      input.archivePath,
      policy,
      filesystem,
    );
    const archiveStats = await filesystem.stat(archivePath);
    if (archiveStats.size > policy.maxFileBytes) {
      throw new Error(`Archive exceeds the ${policy.maxFileBytes}-byte limit.`);
    }

    const destinationPath = await resolveAllowedPath(
      input.destinationPath ?? `${archivePath}.extracted`,
      policy,
      filesystem,
      { mustExist: false },
    );
    await filesystem.mkdir(destinationPath);
    const files = this.services.archive.unzip(
      await filesystem.readFile(archivePath),
    );
    const output: UnzipOutput["files"] = [];

    for (const [entryName, content] of Object.entries(files)) {
      const normalized = entryName.replaceAll("\\", "/");
      const target = path.resolve(destinationPath, normalized);
      if (
        target !== destinationPath &&
        !target.startsWith(`${destinationPath}${path.sep}`)
      ) {
        throw new Error(`Archive entry escapes the destination: ${entryName}`);
      }
      if (output.length >= policy.maxEntries)
        throw new Error("Archive contains too many entries.");
      if (content.length > policy.maxFileBytes)
        throw new Error(`Archive entry is too large: ${entryName}`);
      await filesystem.mkdir(path.dirname(target));
      if (!input.overwrite) {
        try {
          await filesystem.stat(target);
          throw new Error(`File already exists: ${target}`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      await filesystem.writeFile(target, content);
      output.push({ path: target, size: content.length });
    }

    return { destinationPath, files: output };
  };
}
