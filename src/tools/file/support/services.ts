import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { unzipSync } from "fflate";
import * as XLSX from "xlsx";

export type FileStat = {
  size: number;
  mtime: Date;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
};

export type FileEntry = {
  name: string;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
};

export interface FileSystemService {
  realpath(path: string): Promise<string>;
  lstat(path: string): Promise<FileStat>;
  stat(path: string): Promise<FileStat>;
  readdir(path: string): Promise<FileEntry[]>;
  readFile(path: string): Promise<Uint8Array>;
  mkdir(path: string): Promise<void>;
  writeFile(path: string, content: Uint8Array): Promise<void>;
}

export interface ArchiveService {
  unzip(data: Uint8Array): Record<string, Uint8Array>;
}

export type ExcelSheet = { name: string; rows: unknown[][] };

export interface ExcelParserService {
  read(
    data: Uint8Array,
    options: { sheet?: string; range?: string },
  ): ExcelSheet[];
}

export type FileServices = {
  filesystem: FileSystemService;
  archive: ArchiveService;
  excel: ExcelParserService;
};

const filesystem: FileSystemService = {
  realpath,
  lstat,
  stat,
  async readdir(path) {
    return readdir(path, { withFileTypes: true });
  },
  async readFile(path) {
    return new Uint8Array(await readFile(path));
  },
  async mkdir(path) {
    await mkdir(path, { recursive: true });
  },
  async writeFile(path, content) {
    await writeFile(path, content);
  },
};

export const defaultFileServices: FileServices = {
  filesystem,
  archive: { unzip: (data) => unzipSync(data) },
  excel: {
    read(data, options) {
      const workbook = XLSX.read(data, { type: "buffer" });
      const names = options.sheet ? [options.sheet] : workbook.SheetNames;
      return names.map((name) => {
        const sheet = workbook.Sheets[name];
        if (!sheet) throw new Error(`Excel sheet not found: ${name}`);
        return {
          name,
          rows: XLSX.utils.sheet_to_json<unknown[]>(sheet, {
            header: 1,
            range: options.range,
          }),
        };
      });
    },
  },
};
