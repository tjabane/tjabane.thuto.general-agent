import path from "node:path";
import type { FileSystemService } from "./services";

export type FileAccessPolicy = {
  allowedRoots: string[];
  maxFileBytes: number;
  maxOutputBytes: number;
  maxEntries: number;
  allowSymlinks: boolean;
};

export const defaultFileAccessPolicy: FileAccessPolicy = {
  allowedRoots: [process.cwd()],
  maxFileBytes: 25 * 1024 * 1024,
  maxOutputBytes: 2 * 1024 * 1024,
  maxEntries: 10_000,
  allowSymlinks: false,
};

type ContextWithFileAccess = {
  fileAccess?: Partial<FileAccessPolicy>;
};

export function getFileAccessPolicy(
  context: unknown,
  overrides: Partial<FileAccessPolicy> = {},
): FileAccessPolicy {
  const contextPolicy = (context as ContextWithFileAccess).fileAccess ?? {};
  return {
    ...defaultFileAccessPolicy,
    ...contextPolicy,
    ...overrides,
  };
}

export async function resolveAllowedPath(
  value: string,
  policy: FileAccessPolicy,
  filesystem: FileSystemService,
  options: { mustExist?: boolean } = {},
): Promise<string> {
  if (!value.trim()) {
    throw new Error("A file path is required.");
  }

  const candidate = path.resolve(value);
  const existingPath =
    options.mustExist === false ? path.dirname(candidate) : candidate;
  const resolved = await filesystem
    .realpath(existingPath)
    .catch((error: NodeJS.ErrnoException) => {
      if (options.mustExist === false && error.code === "ENOENT") {
        return path.resolve(path.dirname(candidate));
      }
      throw new Error(`Path does not exist: ${value}`);
    });

  const target =
    options.mustExist === false
      ? path.join(resolved, path.basename(candidate))
      : resolved;
  const allowed = policy.allowedRoots.some((root) => {
    const normalizedRoot = path.resolve(root);
    return (
      target === normalizedRoot ||
      target.startsWith(`${normalizedRoot}${path.sep}`)
    );
  });

  if (!allowed) {
    throw new Error(`Path is outside the allowed roots: ${value}`);
  }

  if (!policy.allowSymlinks && options.mustExist !== false) {
    const stats = await filesystem.lstat(candidate);
    if (stats.isSymbolicLink()) {
      throw new Error(`Symbolic links are not allowed: ${value}`);
    }
  }

  return target;
}

export function truncateText(
  value: string,
  maxBytes: number,
): {
  content: string;
  truncated: boolean;
} {
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength <= maxBytes) {
    return { content: value, truncated: false };
  }

  return {
    content: new TextDecoder().decode(bytes.slice(0, maxBytes)),
    truncated: true,
  };
}

export function mediaTypeFor(pathname: string): string {
  const extension = path.extname(pathname).toLowerCase();
  return (
    {
      ".txt": "text/plain",
      ".md": "text/markdown",
      ".json": "application/json",
      ".yaml": "text/yaml",
      ".yml": "text/yaml",
      ".csv": "text/csv",
      ".tsv": "text/tab-separated-values",
      ".pdf": "application/pdf",
      ".xls": "application/vnd.ms-excel",
      ".xlsx":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".xlsm": "application/vnd.ms-excel.sheet.macroenabled.12",
    }[extension] ?? "application/octet-stream"
  );
}
