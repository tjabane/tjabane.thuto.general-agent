import path from "node:path";
import { type ExecutionContext, Tool } from "@general-agent/agent";
import { getFileAccessPolicy, resolveAllowedPath } from "./support/file-types";
import { defaultFileServices, type FileServices } from "./support/services";

export type ListDirectoryInput = {
  path: string;
  recursive?: boolean;
  includeHidden?: boolean;
};

export type DirectoryEntry = {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size: number;
  modifiedAt: string;
};

export class ListDirectoryTool extends Tool<
  ListDirectoryInput,
  DirectoryEntry[]
> {
  constructor(private readonly services: FileServices = defaultFileServices) {
    super();
  }

  readonly name = "list_directory";
  readonly description =
    "List the contents of a directory, or return metadata for a file path.";
  readonly parameters = {
    type: "object" as const,
    properties: {
      path: { type: "string", description: "Directory path to inspect." },
      recursive: {
        type: "boolean",
        description: "List nested directories too.",
      },
      includeHidden: {
        type: "boolean",
        description: "Include dotfiles and hidden entries.",
      },
    },
    required: ["path", "recursive", "includeHidden"],
    additionalProperties: false,
  };

  readonly execute = async (
    context: ExecutionContext,
    input: ListDirectoryInput,
  ): Promise<DirectoryEntry[]> => {
    const policy = getFileAccessPolicy(context);
    const filesystem = this.services.filesystem;
    const root = await resolveAllowedPath(input.path, policy, filesystem);
    const rootStats = await filesystem.stat(root);
    if (!rootStats.isDirectory()) {
      return [
        {
          name: path.basename(root),
          path: root,
          type: "file",
          size: rootStats.size,
          modifiedAt: rootStats.mtime.toISOString(),
        },
      ];
    }

    const entries: DirectoryEntry[] = [];
    const visit = async (directory: string): Promise<void> => {
      for (const entry of await filesystem.readdir(directory)) {
        if (!input.includeHidden && entry.name.startsWith(".")) continue;
        if (entries.length >= policy.maxEntries) {
          throw new Error(
            `Directory listing exceeds the ${policy.maxEntries} entry limit.`,
          );
        }

        const entryPath = path.join(directory, entry.name);
        const entryStats = await filesystem.stat(entryPath);
        const type = entry.isSymbolicLink()
          ? "symlink"
          : entryStats.isDirectory()
            ? "directory"
            : "file";
        entries.push({
          name: entry.name,
          path: entryPath,
          type,
          size: entryStats.isFile() ? entryStats.size : 0,
          modifiedAt: entryStats.mtime.toISOString(),
        });
        if (input.recursive && type === "directory") await visit(entryPath);
      }
    };

    await visit(root);
    return entries.sort((a, b) => a.path.localeCompare(b.path));
  };
}
