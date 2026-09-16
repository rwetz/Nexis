import { workspaceIpc } from "@/platform/workspaces";
import { defineCommand } from "@/platform/ipc";

import type { ReadAiResult } from "@/domain/native-types";

export const aiFilesystem = {
  readFileAi: (path: string) =>
    workspaceIpc.call(
      defineCommand<{ path: string }, ReadAiResult>(
        "fs_read_file_ai",
        "workspace",
      ),
      { path },
    ),
};
