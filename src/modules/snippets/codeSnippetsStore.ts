import { emit, listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import {
  BUILT_IN_SNIPPETS,
  loadCodeSnippets,
  newCodeSnippetId,
  saveCodeSnippets,
  type CodeSnippet,
} from "./codeSnippets";

const CHANGED_EVENT = "nexis://code-snippets-changed";

type State = {
  hydrated: boolean;
  snippets: CodeSnippet[];
  hydrate: () => Promise<void>;
  upsert: (snippet: CodeSnippet) => void;
  remove: (id: string) => void;
};

let initialized = false;

export const useCodeSnippetsStore = create<State>((set, get) => ({
  hydrated: false,
  snippets: [],
  hydrate: async () => {
    if (initialized) return;
    initialized = true;
    const saved = await loadCodeSnippets();
    set({ snippets: saved.length > 0 ? saved : BUILT_IN_SNIPPETS, hydrated: true });
    void listen(CHANGED_EVENT, async () => {
      const refreshed = await loadCodeSnippets();
      set({ snippets: refreshed });
    });
  },
  upsert: (snippet) => {
    const list = get().snippets;
    const idx = list.findIndex((s) => s.id === snippet.id);
    const next =
      idx === -1
        ? [...list, snippet]
        : list.map((s) => (s.id === snippet.id ? snippet : s));
    set({ snippets: next });
    void saveCodeSnippets(next).then(() => emit(CHANGED_EVENT));
  },
  remove: (id) => {
    const next = get().snippets.filter((s) => s.id !== id);
    set({ snippets: next });
    void saveCodeSnippets(next).then(() => emit(CHANGED_EVENT));
  },
}));

export { newCodeSnippetId };
