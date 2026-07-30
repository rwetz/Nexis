// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { currentWorkspaceEnv } from "@/modules/workspace";
import {
  AUTOSAVE_DEBOUNCE_MS,
  deleteEditorAutosave,
  readEditorAutosave,
  sweepEditorAutosavesOnce,
  writeEditorAutosave,
} from "./autosave-bridge";

type ReadResult =
  | { kind: "text"; content: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "toolarge"; size: number; limit: number };

export type DocumentState =
  | { status: "loading" }
  | {
      status: "ready";
      content: string;
      size: number;
      /** Crash-recovery snapshot whose content differs from disk, offered
       * via the editor banner until restored or discarded. */
      recovered: string | null;
    }
  | { status: "binary"; size: number }
  | { status: "toolarge"; size: number; limit: number }
  | { status: "error"; message: string };

type Options = {
  path: string;
  onDirtyChange?: (dirty: boolean) => void;
};

export function useDocument({ path, onDirtyChange }: Options) {
  const [doc, setDoc] = useState<DocumentState>({ status: "loading" });
  const [dirty, setDirty] = useState(false);
  const [reloadCounter, setReloadCounter] = useState(0);

  // Track the saved buffer so we can detect changes cheaply.
  const savedRef = useRef<string>("");
  const bufferRef = useRef<string>("");
  const dirtyRef = useRef(false);
  const docRef = useRef<DocumentState>(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  // Crash-recovery autosave: debounced snapshot of the dirty buffer.
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // Notify parent of dirty transitions.
  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);
  useEffect(() => {
    onDirtyChangeRef.current?.(dirty);
  }, [dirty]);

  // Load on path change or explicit reload.
  useEffect(() => {
    let cancelled = false;
    setDoc({ status: "loading" });
    setDirty(false);

    invoke<ReadResult>("fs_read_file", { path, workspace: currentWorkspaceEnv() })
      .then(async (res) => {
        if (cancelled) return;
        if (res.kind === "text") {
          savedRef.current = res.content;
          bufferRef.current = res.content;
          // Crash recovery: an autosave that still differs from disk holds
          // edits from a session that never saved — offer it. One that
          // matches disk is just a leftover from a completed save; drop it.
          sweepEditorAutosavesOnce();
          let recovered: string | null = null;
          try {
            const snap = await readEditorAutosave(path);
            if (snap !== null && snap !== res.content) recovered = snap;
            else if (snap !== null) void deleteEditorAutosave(path).catch(() => {});
          } catch {
            // Recovery is best-effort; the file itself loaded fine.
          }
          if (cancelled) return;
          setDoc({
            status: "ready",
            content: res.content,
            size: res.size,
            recovered,
          });
        } else if (res.kind === "binary") {
          setDoc({ status: "binary", size: res.size });
        } else if (res.kind === "toolarge") {
          setDoc({
            status: "toolarge",
            size: res.size,
            limit: res.limit,
          });
        }
      })
      .catch((e) => {
        if (!cancelled) setDoc({ status: "error", message: String(e) });
      });

    return () => {
      cancelled = true;
    };
  }, [path, reloadCounter]);

  /** Re-read the file from disk. No-op (silent) if the buffer is dirty —
   *  callers shouldn't clobber unsaved user edits. Returns whether reload ran. */
  const reload = useCallback((): boolean => {
    if (dirtyRef.current) return false;
    setReloadCounter((n) => n + 1);
    return true;
  }, []);

  /** Force re-read from disk regardless of dirty state. Used post-format. */
  const reloadForce = useCallback((): void => {
    setReloadCounter((n) => n + 1);
  }, []);

  const onChange = useCallback(
    (next: string) => {
      bufferRef.current = next;
      const isDirty = next !== savedRef.current;
      setDirty(isDirty);
      // Debounced crash-recovery snapshot. Edited back to the saved state →
      // remove the snapshot instead, so no stale recovery is offered later.
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (isDirty) {
        autosaveTimerRef.current = setTimeout(() => {
          autosaveTimerRef.current = null;
          void writeEditorAutosave(path, bufferRef.current).catch(() => {});
        }, AUTOSAVE_DEBOUNCE_MS);
      } else {
        autosaveTimerRef.current = null;
        void deleteEditorAutosave(path).catch(() => {});
      }
    },
    [path],
  );

  // Cancel any pending snapshot when the pane unmounts or switches files —
  // a timer firing for the previous path would write the new file's buffer
  // under the old file's key.
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [path]);

  const save = useCallback(async () => {
    if (!dirty) return;
    const content = bufferRef.current;
    await invoke("fs_write_file", {
      path,
      content,
      workspace: currentWorkspaceEnv(),
      source: "editor",
    });
    savedRef.current = content;
    setDirty(false);
    // Saved — the recovery snapshot is now redundant.
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    void deleteEditorAutosave(path).catch(() => {});
  }, [path, dirty]);

  /** Adopt the crash-recovery snapshot as the buffer (dirty until saved).
   * The autosave file stays — if this session also dies before saving, the
   * same recovery is offered again. */
  const applyRecovery = useCallback(() => {
    const d = docRef.current;
    if (d.status !== "ready" || d.recovered === null) return;
    bufferRef.current = d.recovered;
    setDirty(true);
    setDoc({
      status: "ready",
      content: d.recovered,
      size: d.size,
      recovered: null,
    });
  }, []);

  /** Reject the crash-recovery snapshot and delete it from disk. */
  const discardRecovery = useCallback(() => {
    const d = docRef.current;
    if (d.status !== "ready" || d.recovered === null) return;
    setDoc({ ...d, recovered: null });
    void deleteEditorAutosave(path).catch(() => {});
  }, [path]);

  return {
    doc,
    dirty,
    onChange,
    save,
    reload,
    reloadForce,
    applyRecovery,
    discardRecovery,
  };
}
