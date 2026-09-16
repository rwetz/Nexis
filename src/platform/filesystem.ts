import { hostIpc } from "@/platform/tauri";
import { workspaceIpc } from "@/platform/workspaces";
import { defineCommand, type PlatformIpc } from "@/platform/ipc";

import type {
  ReadResult,
  DirEntry,
  GrepResponse,
  GlobResponse,
  FileSearchResponse,
  ListFilesResult,
} from "@/domain/native-types";

export function createFilesystem(
  ipc: PlatformIpc,
  scope: "host" | "workspace",
) {
  return {
    readFile: (path: string) =>
      ipc.call(
        defineCommand<{ path: string }, ReadResult>("fs_read_file", scope),
        { path },
      ),
    writeFile: (path: string, content: string, source?: string) =>
      ipc.call(
        defineCommand<{ path: string; content: string; source?: string }, void>(
          "fs_write_file",
          scope,
        ),
        { path, content, ...(source ? { source } : {}) },
      ),
    rename: (from: string, to: string) =>
      ipc.call(
        defineCommand<{ from: string; to: string }, void>("fs_rename", scope),
        { from, to },
      ),
    delete: (path: string) =>
      ipc.call(defineCommand<{ path: string }, void>("fs_delete", scope), {
        path,
      }),
    writeFileBytes: (path: string, bytes: Uint8Array) =>
      ipc.call(
        defineCommand<{ path: string; bytes: number[] }, void>(
          "fs_write_file_bytes",
          scope,
        ),
        { path, bytes: Array.from(bytes) },
      ),
    canonicalize: (path: string) =>
      ipc.call(
        defineCommand<{ path: string }, string>("fs_canonicalize", scope),
        { path },
      ),
    createFile: (path: string) =>
      ipc.call(defineCommand<{ path: string }, void>("fs_create_file", scope), {
        path,
      }),
    createDir: (path: string) =>
      ipc.call(defineCommand<{ path: string }, void>("fs_create_dir", scope), {
        path,
      }),
    readDir: (path: string, showHidden: boolean) =>
      ipc.call(
        defineCommand<{ path: string; showHidden: boolean }, DirEntry[]>(
          "fs_read_dir",
          scope,
        ),
        { path, showHidden },
      ),
    grep: (params: {
      pattern: string;
      root: string;
      glob?: string[];
      caseInsensitive?: boolean;
      maxResults?: number;
    }) =>
      ipc.call(
        defineCommand<
          {
            pattern: string;
            root: string;
            glob: string[] | null;
            caseInsensitive: boolean | null;
            maxResults: number | null;
          },
          GrepResponse
        >("fs_grep", scope),
        {
          pattern: params.pattern,
          root: params.root,
          glob: params.glob ?? null,
          caseInsensitive: params.caseInsensitive ?? null,
          maxResults: params.maxResults ?? null,
        },
      ),
    glob: (params: { pattern: string; root: string; maxResults?: number }) =>
      ipc.call(
        defineCommand<
          { pattern: string; root: string; maxResults: number | null },
          GlobResponse
        >("fs_glob", scope),
        {
          pattern: params.pattern,
          root: params.root,
          maxResults: params.maxResults ?? null,
        },
      ),
    search: (params: {
      root: string;
      query: string;
      limit: number;
      showHidden: boolean;
    }) =>
      ipc.call(
        defineCommand<
          { root: string; query: string; limit: number; showHidden: boolean },
          FileSearchResponse
        >("fs_search", scope),
        params,
      ),
    listFiles: (root: string) =>
      ipc.call(
        defineCommand<{ root: string }, ListFilesResult>("fs_list_files", scope),
        { root },
      ),
    fsWatchStart: (path: string) =>
      hostIpc.call(
        defineCommand<{ path: string }, boolean>("fs_watch_start", "host"),
        { path },
      ),
    fsWatchStop: () =>
      hostIpc.call(
        defineCommand<Record<string, never>, void>("fs_watch_stop", "host"),
        {},
      ),
  };
}

export const filesystem = createFilesystem(workspaceIpc, "workspace");
export const hostFilesystem = createFilesystem(hostIpc, "host");
