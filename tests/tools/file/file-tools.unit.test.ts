import { describe, expect, test } from "bun:test";
import {
  type FileServices,
  ListDirectoryTool,
  ReadFileTool,
  UnzipTool,
} from "../../src/tools";

const root = "C:\\test-workspace";
const context = { runId: "unit-test", fileAccess: { allowedRoots: [root] } };

function fileStat(size: number, directory = false) {
  return {
    size,
    mtime: new Date("2026-01-01T00:00:00.000Z"),
    isFile: () => !directory,
    isDirectory: () => directory,
    isSymbolicLink: () => false,
  };
}

function fakeServices(
  options: {
    files?: Record<string, string>;
    directories?: Record<string, Array<{ name: string; directory?: boolean }>>;
    archive?: Record<string, Uint8Array>;
  } = {},
): FileServices {
  const files = new Map(
    Object.entries(options.files ?? {}).map(([name, value]) => [
      name,
      new TextEncoder().encode(value),
    ]),
  );
  const directories = options.directories ?? {};
  const writes = new Map<string, Uint8Array>();
  return {
    filesystem: {
      realpath: async (value) => value,
      lstat: async (value) => fileStat(files.get(value)?.length ?? 0),
      stat: async (value) => {
        if (directories[value]) return fileStat(0, true);
        if (files.has(value) || writes.has(value)) {
          return fileStat(
            files.get(value)?.length ?? writes.get(value)?.length ?? 0,
          );
        }
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
      readdir: async (value) =>
        (directories[value] ?? []).map((entry) => ({
          name: entry.name,
          isDirectory: () => entry.directory ?? false,
          isSymbolicLink: () => false,
        })),
      readFile: async (value) => files.get(value) ?? new Uint8Array(),
      mkdir: async () => undefined,
      writeFile: async (value, content) => {
        writes.set(value, content);
      },
    },
    archive: {
      unzip: () => options.archive ?? {},
    },
    pdf: {
      extractText: async () => [{ text: "page one" }, { text: "page two" }],
    },
    excel: {
      read: () => [
        {
          name: "Sheet1",
          rows: [
            ["A", "B"],
            [1, 2],
          ],
        },
      ],
    },
  };
}

describe("file tools with injected services", () => {
  test("list_directory uses the injected filesystem", async () => {
    const services = fakeServices({
      directories: {
        [root]: [{ name: "notes.txt" }, { name: "nested", directory: true }],
        [`${root}\\nested`]: [],
      },
      files: { [`${root}\\notes.txt`]: "notes" },
    });

    const result = await new ListDirectoryTool(services).execute(context, {
      path: root,
    });

    expect(result.map((entry) => entry.name)).toEqual(["nested", "notes.txt"]);
  });

  test("unzip uses the injected archive and filesystem services", async () => {
    const archivePath = `${root}\\archive.zip`;
    const services = fakeServices({
      files: { [archivePath]: "archive" },
      archive: { "hello.txt": new TextEncoder().encode("hello") },
    });

    const result = await new UnzipTool(services).execute(context, {
      archivePath,
      destinationPath: `${root}\\out`,
    });

    expect(result.files).toEqual([
      { path: `${root}\\out\\hello.txt`, size: 5 },
    ]);
  });

  test("read_file delegates PDF and Excel parsing", async () => {
    const services = fakeServices({
      files: {
        [`${root}\\document.pdf`]: "pdf",
        [`${root}\\book.xlsx`]: "excel",
      },
    });
    const tool = new ReadFileTool(services);

    await expect(
      tool.execute(context, { path: `${root}\\document.pdf` }),
    ).resolves.toMatchObject({
      format: "pdf",
      content: JSON.stringify([
        { page: 1, text: "page one" },
        { page: 2, text: "page two" },
      ]),
    });
    await expect(
      tool.execute(context, { path: `${root}\\book.xlsx`, sheet: "Sheet1" }),
    ).resolves.toMatchObject({
      format: "excel",
      content: {
        sheets: [
          {
            name: "Sheet1",
            rows: [
              ["A", "B"],
              [1, 2],
            ],
          },
        ],
      },
    });
  });
});
