// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Channel } from "@tauri-apps/api/core";
import { defineCommand } from "@/platform/ipc";
import { hostIpc } from "@/platform/tauri";
import { currentWorkspaceEnv, ipcForEnvironment } from "@/platform/workspaces";

export type PtyHandlers = {
  onData: (bytes: Uint8Array) => void;
  onExit?: (code: number) => void;
};

export type PtySession = {
  id: number;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  close: () => Promise<void>;
};

const cwdCommand = defineCommand<{ id: number }, string | null>("pty_cwd", "host");
const authorizeCwd = defineCommand<{ path: string }, string>("workspace_authorize", "workspace");
const openCommand = defineCommand<{
  cols: number;
  rows: number;
  cwd: string | null;
  extraEnv: Record<string, string> | null;
  shell: string | null;
  onData: Channel<ArrayBuffer>;
  onExit: Channel<number>;
}, number>("pty_open", "workspace");
const writeCommand = defineCommand<{ id: number; data: string }, void>("pty_write", "host");
const resizeCommand = defineCommand<{ id: number; cols: number; rows: number }, void>("pty_resize", "host");
const closeCommand = defineCommand<{ id: number }, void>("pty_close", "host");

/**
 * Best-effort real cwd of a PTY session's shell process (Linux: readlink
 * /proc/<pid>/cwd; other platforms resolve to null). Used as a cwd-tracking
 * fallback when shell integration never emits OSC 7.
 */
export async function ptyCwd(id: number): Promise<string | null> {
  return hostIpc.call(cwdCommand, { id });
}

export async function openPty(
  cols: number,
  rows: number,
  handlers: PtyHandlers,
  cwd?: string,
  extraEnv?: Record<string, string>,
  shell?: string,
): Promise<PtySession> {
  const ipc = ipcForEnvironment(currentWorkspaceEnv());
  // Pre-authorize the cwd so pty_open doesn't reject paths that are outside
  // the bootstrap workspace roots. Interactive terminal sessions should be
  // able to start in any directory the user navigates to. If the path doesn't
  // exist, workspace_authorize will fail here but pty_open will also reject it
  // with a clearer "cwd not accessible" error, so we can safely swallow this.
  if (cwd) {
    await ipc.call(authorizeCwd, { path: cwd }).catch(() => {});
  }

  // Raw bytes — no base64/JSON round-trip; messages arrive as ArrayBuffer.
  const onData = new Channel<ArrayBuffer>();
  const onExit = new Channel<number>();

  let released = false;
  const noop = () => {};
  const releaseHandlers = () => {
    if (released) return;
    released = true;
    onData.onmessage = noop;
    onExit.onmessage = noop;
  };

  onData.onmessage = (buf) => handlers.onData(new Uint8Array(buf));
  onExit.onmessage = (code) => {
    handlers.onExit?.(code);
    releaseHandlers();
  };

  const spawnArgs = (spawnCwd: string | null) => ({
    cols,
    rows,
    cwd: spawnCwd,
    extraEnv: extraEnv && Object.keys(extraEnv).length > 0 ? extraEnv : null,
    shell: shell && shell.trim() ? shell.trim() : null,
    onData,
    onExit,
  });

  let id: number;
  try {
    id = await ipc.call(openCommand, spawnArgs(cwd ?? null));
  } catch (e) {
    // A stale cwd (directory deleted/renamed/moved since the session was
    // saved, or the "//?/…" verbatim hybrid older builds stored — pitfall
    // #19) must not brick the tab permanently: retry once without it so the
    // shell starts in its default directory instead of never starting.
    if (!cwd || !String(e).includes("cwd not accessible")) throw e;
    console.warn(
      `[nexis] cwd ${cwd} is inaccessible — falling back to the default directory:`,
      e,
    );
    id = await ipc.call(openCommand, spawnArgs(null));
  }

  let closed = false;

  return {
    id,
    write: (data) => hostIpc.call(writeCommand, { id, data }),
    resize: (c, r) => hostIpc.call(resizeCommand, { id, cols: c, rows: r }),
    close: async () => {
      if (closed) return;
      closed = true;
      try {
        await hostIpc.call(closeCommand, { id });
      } finally {
        releaseHandlers();
      }
    },
  };
}
