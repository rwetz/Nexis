import { useEffect, useState } from "react";

/**
 * Centralises the open/closed state for every overlay and dialog that can
 * appear on the main window: shortcuts, new-editor, quick file picker, and
 * the shell history overlay.
 *
 * Moving this out of App.tsx keeps the component focused on layout and
 * wiring rather than scattered `useState` declarations.
 */
export function useDialogCoordinator() {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [newEditorOpen, setNewEditorOpen] = useState(false);
  const [quickFilePickerOpen, setQuickFilePickerOpen] = useState(false);
  const [historyLeafId, setHistoryLeafId] = useState<number | null>(null);
  const [workspaceSearchOpen, setWorkspaceSearchOpen] = useState(false);

  // Listen for Ctrl+R intercepts emitted by the terminal renderer pool.
  useEffect(() => {
    const handler = (e: Event) => {
      const { leafId } = (e as CustomEvent<{ leafId: number }>).detail;
      setHistoryLeafId(leafId);
    };
    window.addEventListener("nexis:history-open", handler);
    return () => window.removeEventListener("nexis:history-open", handler);
  }, []);

  return {
    shortcutsOpen,
    setShortcutsOpen,
    newEditorOpen,
    setNewEditorOpen,
    quickFilePickerOpen,
    setQuickFilePickerOpen,
    historyLeafId,
    setHistoryLeafId,
    workspaceSearchOpen,
    setWorkspaceSearchOpen,
  };
}
