import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { type ExecutionContext, Tool } from "@general-agent/agent";

type FileUploadInput = {
  filePath: string;
  sandboxPath: string | null;
};

type FileUploadOutput = {
  results: string;
};

export class FileUploadTool extends Tool<FileUploadInput, FileUploadOutput> {
  readonly name = "file_upload";
  readonly description =
    "Uploads a file to the sandbox environment. Use it to transfer files from the host machine to the isolated sandbox for further processing or execution.";
  readonly parameters = {
    type: "object" as const,
    properties: {
      filePath: {
        type: "string",
        description: "The path of the file on the host machine to upload",
      },
      sandboxPath: {
        type: ["string", "null"],
        description:
          "The destination file path in the sandbox, or null to use /home/user/<filename>",
      },
    },
    required: ["filePath", "sandboxPath"],
    additionalProperties: false,
  };

  readonly execute = async (
    context: ExecutionContext,
    { filePath, sandboxPath }: FileUploadInput,
  ): Promise<FileUploadOutput> => {
    if (!context.codeEnv) {
      throw new Error("No sandbox execution environment available.");
    }

    if (!(await this.fileExists(filePath))) {
      throw new Error(`File at path ${filePath} does not exist.`);
    }

    if (!sandboxPath) {
      const fileName = path.basename(filePath);
      sandboxPath = `/home/user/${fileName}`;
    }
    try {
      const contents = await readFile(filePath);
      await context.codeEnv.files.write(sandboxPath, contents);
      return { results: `File uploaded successfully to ${sandboxPath}` };
    } catch (error) {
      return {
        results: `Failed to upload file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  };

  async fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
}
