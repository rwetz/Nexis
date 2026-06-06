// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { clearActiveSuggestion, setActiveSuggestion } from "./rendererPool";

export type SuggestionState = {
  text: string;
  x: number;
  y: number;
} | null;

function findHistoryMatch(input: string, history: string[]): string | null {
  if (!input) return null;
  const lower = input.toLowerCase();
  for (const entry of history) {
    if (
      entry.toLowerCase().startsWith(lower) &&
      entry.length > input.length
    ) {
      return entry;
    }
  }
  return null;
}

export function useTerminalSuggestions(leafId: number) {
  const [suggestion, setSuggestion] = useState<SuggestionState>(null);
  const history = useRef<string[]>([]);
  const enabled = usePreferencesStore((s) => s.terminalSuggestionsEnabled);

  useEffect(() => {
    invoke<string[]>("read_shell_history")
      .then((h) => {
        history.current = h;
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled) {
      setSuggestion(null);
      return;
    }

    const handleUpdate = (e: Event) => {
      const d = (e as CustomEvent<{ leafId: number; input: string; x: number; y: number }>).detail;
      if (d.leafId !== leafId) return;
      const match = findHistoryMatch(d.input, history.current);
      if (match) {
        const suffix = match.slice(d.input.length);
        setSuggestion({ text: suffix, x: d.x, y: d.y });
        setActiveSuggestion(leafId, suffix);
      } else {
        setSuggestion(null);
        clearActiveSuggestion(leafId);
      }
    };

    const handleClear = (e: Event) => {
      if ((e as CustomEvent<{ leafId: number }>).detail.leafId !== leafId) return;
      setSuggestion(null);
      clearActiveSuggestion(leafId);
    };

    const handleAccepted = (e: Event) => {
      if ((e as CustomEvent<{ leafId: number }>).detail.leafId !== leafId) return;
      setSuggestion(null);
    };

    window.addEventListener("nexis:input-updated", handleUpdate);
    window.addEventListener("nexis:input-cleared", handleClear);
    window.addEventListener("nexis:suggestion-accepted", handleAccepted);
    return () => {
      window.removeEventListener("nexis:input-updated", handleUpdate);
      window.removeEventListener("nexis:input-cleared", handleClear);
      window.removeEventListener("nexis:suggestion-accepted", handleAccepted);
    };
  }, [leafId, enabled]);

  const dismiss = useCallback(() => {
    setSuggestion(null);
    clearActiveSuggestion(leafId);
  }, [leafId]);

  return { suggestion, dismiss };
}
