import { hostIpc } from "@/platform/tauri";
import { defineCommand } from "@/platform/ipc";

export const ledgerStorage = {
  ledgerAppend: (workspaceId: string, record: string) =>
    hostIpc.call(
      defineCommand<{ workspaceId: string; record: string }, void>(
        "ledger_append",
        "host",
      ),
      { workspaceId, record },
    ),
  ledgerWriteOutput: (workspaceId: string, outputId: string, content: string) =>
    hostIpc.call(
      defineCommand<
        { workspaceId: string; outputId: string; content: string },
        void
      >("ledger_write_output", "host"),
      { workspaceId, outputId, content },
    ),
  ledgerReadOutput: (workspaceId: string, outputId: string) =>
    hostIpc.call(
      defineCommand<{ workspaceId: string; outputId: string }, string | null>(
        "ledger_read_output",
        "host",
      ),
      { workspaceId, outputId },
    ),
  ledgerRead: (workspaceId: string, limit: number) =>
    hostIpc.call(
      defineCommand<{ workspaceId: string; limit: number }, string[]>(
        "ledger_read",
        "host",
      ),
      { workspaceId, limit },
    ),
  ledgerForgetEntry: (workspaceId: string, id: string) =>
    hostIpc.call(
      defineCommand<{ workspaceId: string; id: string }, void>(
        "ledger_forget_entry",
        "host",
      ),
      { workspaceId, id },
    ),
  ledgerForgetSince: (workspaceId: string, sinceMs: number) =>
    hostIpc.call(
      defineCommand<{ workspaceId: string; sinceMs: number }, number>(
        "ledger_forget_since",
        "host",
      ),
      { workspaceId, sinceMs },
    ),
  ledgerForgetWorkspace: (workspaceId: string) =>
    hostIpc.call(
      defineCommand<{ workspaceId: string }, void>(
        "ledger_forget_workspace",
        "host",
      ),
      { workspaceId },
    ),
  ledgerQuery: (params: {
    workspaceId: string;
    query: {
      query: string;
      exit: "success" | "failure" | null;
      dedupe: boolean;
      limit: number;
    };
  }) =>
    hostIpc.call(
      defineCommand<
        {
          workspaceId: string;
          query: {
            query: string;
            exit: "success" | "failure" | null;
            dedupe: boolean;
            limit: number;
          };
        },
        string[]
      >("ledger_query", "host"),
      params,
    ),
  ledgerSearchOutput: (params: {
    workspaceId: string;
    query: string;
    limit: number;
  }) =>
    hostIpc.call(
      defineCommand<
        { workspaceId: string; query: string; limit: number },
        { line: string; snippet: string; matches: number }[]
      >("ledger_search_output", "host"),
      params,
    ),
  ledgerStats: (workspaceId: string) =>
    hostIpc.call(
      defineCommand<
        { workspaceId: string },
        {
          records: number;
          logBytes: number;
          blobCount: number;
          blobBytes: number;
          oldestMs: number | null;
          newestMs: number | null;
        }
      >("ledger_stats", "host"),
      { workspaceId },
    ),
  ledgerPrune: (params: {
    workspaceId: string;
    maxRecords: number;
    maxAgeDays: number;
    maxBlobBytes: number;
    nowMs: number;
  }) =>
    hostIpc.call(
      defineCommand<
        {
          workspaceId: string;
          maxRecords: number;
          maxAgeDays: number;
          maxBlobBytes: number;
          nowMs: number;
        },
        void
      >("ledger_prune", "host"),
      params,
    ),
};
