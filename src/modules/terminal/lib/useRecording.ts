// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * useRecording — per-leaf terminal session recorder.
 *
 * Produces asciinema v2 `.cast` files saved to ~/nexis-recordings/ via the
 * Rust `save_cast_recording` command.
 */
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef, useState } from "react";
import { redactSensitive } from "@/modules/ai/lib/redact";
import { getSessionDimensions, registerRecordingHandler } from "./useTerminalSession";

type CastEvent = [number, "o", string];

type RecordingState = {
  startTime: number;
  events: CastEvent[];
  cols: number;
  rows: number;
  bytes: number;
  truncated: boolean;
};

const decoder = new TextDecoder("utf-8", { fatal: false });

// Ceiling on accumulated recording text (IDEAS A5 buffer-cap sweep). A recorder
// left running indefinitely would otherwise grow `events` without bound and
// eventually exhaust memory / produce an unwritable file. At the cap we stop
// appending and emit a single truncation notice, keeping the .cast valid.
const MAX_RECORDING_BYTES = 64 * 1024 * 1024;

// Live recording sizes per leaf, for the debug memory self-report.
const recordingBytes = new Map<number, number>();

/** Total bytes accumulated across all in-flight recordings. */
export function totalRecordingBytes(): number {
  let total = 0;
  for (const n of recordingBytes.values()) total += n;
  return total;
}

export function useRecording(leafId: number) {
  const [isRecording, setIsRecording] = useState(false);
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);
  const stateRef = useRef<RecordingState | null>(null);

  const startRecording = useCallback(() => {
    if (stateRef.current) return; // already recording
    const { cols, rows } = getSessionDimensions(leafId);
    stateRef.current = {
      startTime: Date.now(),
      events: [],
      cols: cols > 0 ? cols : 80,
      rows: rows > 0 ? rows : 24,
      bytes: 0,
      truncated: false,
    };
    registerRecordingHandler(leafId, (bytes: Uint8Array) => {
      const state = stateRef.current;
      if (!state || state.truncated) return;
      const elapsed = (Date.now() - state.startTime) / 1000;
      const text = decoder.decode(bytes);
      if (state.bytes + text.length > MAX_RECORDING_BYTES) {
        // Hit the ceiling: emit one notice and stop accumulating. The user can
        // still stop & save; the recording up to this point stays intact.
        state.truncated = true;
        state.events.push([
          elapsed,
          "o",
          "\r\n[nexis: recording truncated — size limit reached]\r\n",
        ]);
        return;
      }
      state.bytes += text.length;
      recordingBytes.set(leafId, state.bytes);
      state.events.push([elapsed, "o", text]);
    });
    recordingBytes.set(leafId, 0);
    setIsRecording(true);
  }, [leafId]);

  const stopAndSave = useCallback(async (): Promise<string | null> => {
    const state = stateRef.current;
    if (!state) return null;
    registerRecordingHandler(leafId, null);
    stateRef.current = null;
    recordingBytes.delete(leafId);
    setIsRecording(false);

    const nowSec = Math.floor(Date.now() / 1000);
    const durationSec = state.events.length > 0
      ? state.events[state.events.length - 1][0]
      : 0;
    const startSec = nowSec - Math.ceil(durationSec);

    // Asciinema v2 header
    const header = JSON.stringify({
      version: 2,
      width: state.cols,
      height: state.rows,
      timestamp: startSec,
      title: "Nexis terminal recording",
    });
    // Recordings get attached to bug reports and shared — key-shaped strings
    // captured from terminal output are scrubbed before the file exists.
    const lines = [
      header,
      ...state.events.map(([t, kind, text]) =>
        JSON.stringify([t, kind, kind === "o" ? redactSensitive(text) : text]),
      ),
    ];
    const content = lines.join("\n") + "\n";

    try {
      const savedPath = await invoke<string>("save_cast_recording", { content });
      setLastSavedPath(savedPath);
      return savedPath;
    } catch (e) {
      console.error("[nexis] save recording failed:", e);
      return null;
    }
  }, [leafId]);

  const cancelRecording = useCallback(() => {
    registerRecordingHandler(leafId, null);
    stateRef.current = null;
    recordingBytes.delete(leafId);
    setIsRecording(false);
  }, [leafId]);

  return { isRecording, lastSavedPath, startRecording, stopAndSave, cancelRecording };
}
