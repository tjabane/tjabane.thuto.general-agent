import { describe, expect, test } from "bun:test";
import {
  type FileServices,
  ListDirectoryTool,
  type MediaAnalysisRequest,
  ReadFileTool,
  ReadMediaTool,
  UnzipTool,
} from "../../../src/tools";

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
  test("read_media delegates media bytes and prompts to the analyzer", async () => {
    let request: { kind: string; prompt: string; filename: string } | undefined;
    const services = {
      ...fakeServices({
        files: { [`${root}\\photo.png`]: "image-bytes" },
      }),
      analyzer: {
        analyze: async (input: MediaAnalysisRequest) => {
          request = {
            kind: input.kind,
            prompt: input.prompt,
            filename: input.filename,
          };
          return { analysis: "A photo of a mountain.", model: "fake-vision" };
        },
      },
    };

    await expect(
      new ReadMediaTool(services).execute(context, {
        path: `${root}\\photo.png`,
        prompt: "What is shown?",
      }),
    ).resolves.toMatchObject({
      mediaType: "image",
      analysis: "A photo of a mountain.",
      model: "fake-vision",
    });
    expect(request).toEqual({
      kind: "image",
      prompt: "What is shown?",
      filename: "photo.png",
    });
  });

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

  test("list_directory returns metadata when given a file path", async () => {
    const filePath = `${root}\\notes.txt`;
    const services = fakeServices({ files: { [filePath]: "notes" } });

    await expect(
      new ListDirectoryTool(services).execute(context, { path: filePath }),
    ).resolves.toEqual([
      {
        name: "notes.txt",
        path: filePath,
        type: "file",
        size: 5,
        modifiedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
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

  test("read_file delegates Excel parsing", async () => {
    const services = fakeServices({
      files: {
        [`${root}\\book.xlsx`]: "excel",
      },
    });
    const tool = new ReadFileTool(services);

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

  test("read_file redirects PDFs to read_media", async () => {
    const services = fakeServices({
      files: { [`${root}\\document.pdf`]: "pdf" },
    });

    await expect(
      new ReadFileTool(services).execute(context, {
        path: `${root}\\document.pdf`,
      }),
    ).rejects.toThrow("PDF files must be analyzed with read_media.");
  });
});
