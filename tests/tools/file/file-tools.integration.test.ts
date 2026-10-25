import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ListDirectoryTool, ReadFileTool, UnzipTool } from "../../../src/tools";

const context = { runId: "test-run" };

describe("file tools", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "general-agent-files-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("lists directory entries", async () => {
    await mkdir(path.join(root, "nested"));
    await writeFile(path.join(root, "hello.txt"), "hello");

    const entries = await new ListDirectoryTool().execute(
      { ...context, fileAccess: { allowedRoots: [root] } },
      { path: root },
    );

    expect(entries.map(({ name }) => name)).toEqual(["hello.txt", "nested"]);
  });

  test("reads text and CSV files", async () => {
    const textPath = path.join(root, "note.txt");
    const csvPath = path.join(root, "data.csv");
    await writeFile(textPath, "hello world");
    await writeFile(csvPath, 'name,score\nAlice,10\n"Bob, Jr",9\n');
    const tool = new ReadFileTool();
    const fileAccess = { allowedRoots: [root] };

    await expect(
      tool.execute({ ...context, fileAccess }, { path: textPath }),
    ).resolves.toMatchObject({
      format: "text",
      content: "hello world",
      truncated: false,
    });
    await expect(
      tool.execute({ ...context, fileAccess }, { path: csvPath }),
    ).resolves.toMatchObject({
      format: "csv",
      content: JSON.stringify([
        ["name", "score"],
        ["Alice", "10"],
        ["Bob, Jr", "9"],
      ]),
    });
  });

  test("extracts ZIP files and rejects traversal entries", async () => {
    const archivePath = path.join(root, "files.zip");
    await writeFile(
      archivePath,
      Buffer.from(
        "UEsDBBQAAAAIAE9oWV3xhmx6BQAAAAMAAAAHAAAAb25lLnR4dMvPSwUAUEsBAhQAFAAAAAgAT2hZXfGGbHoFAAAAAwAAAAcAAAAAAAAAAAAAAAAAAAAAAG9uZS50eHRQSwUGAAAAAAEAAQA1AAAAKgAAAAAA",
        "base64",
      ),
    );
    const output = await new UnzipTool().execute(
      { ...context, fileAccess: { allowedRoots: [root] } },
      { archivePath },
    );
    await expect(
      readFile(path.join(output.destinationPath, "one.txt"), "utf8"),
    ).resolves.toBe("one");

    await writeFile(
      archivePath,
      Buffer.from(
        "UEsDBBQAAAAIAE9oWV0fKKpnBAAAAAIAAAAQAAAALi4vLi4vZXNjYXBlLnR4dMvLBwBQSwECFAAUAAAACABPaFldHyiqZwQAAAACAAAAEAAAAAAAAAAAAAAAAAAAAAAALi4vLi4vZXNjYXBlLnR4dFBLBQYAAAAAAQABAD4AAAAyAAAAAAA=",
        "base64",
      ),
    );
    await expect(
      new UnzipTool().execute(
        { ...context, fileAccess: { allowedRoots: [root] } },
        { archivePath, destinationPath: path.join(root, "safe") },
      ),
    ).rejects.toThrow("escapes the destination");
  });

  test("does not allow reading outside configured roots", async () => {
    const outside = path.join(root, "..", "outside.txt");
    await writeFile(outside, "secret");
    await expect(
      new ReadFileTool().execute(
        { ...context, fileAccess: { allowedRoots: [root] } },
        { path: outside },
      ),
    ).rejects.toThrow("outside the allowed roots");
    await rm(outside, { force: true });
  });
});
