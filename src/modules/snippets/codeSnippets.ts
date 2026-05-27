import { LazyStore } from "@tauri-apps/plugin-store";

export type CodeSnippet = {
  id: string;
  name: string;
  prefix: string;
  language: string;
  body: string;
  description?: string;
};

const STORE_PATH = "nexis-code-snippets.json";
const KEY_LIST = "snippets";
const store = new LazyStore(STORE_PATH, { defaults: {}, autoSave: 200 });

export async function loadCodeSnippets(): Promise<CodeSnippet[]> {
  return (await store.get<CodeSnippet[]>(KEY_LIST)) ?? [];
}

export async function saveCodeSnippets(list: CodeSnippet[]): Promise<void> {
  await store.set(KEY_LIST, list);
  await store.save();
}

export function newCodeSnippetId(): string {
  return `cs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export const BUILT_IN_SNIPPETS: CodeSnippet[] = [
  {
    id: "builtin-ts-cl",
    name: "console.log",
    prefix: "cl",
    language: "typescript",
    body: "console.log($1);",
    description: "Log to console",
  },
  {
    id: "builtin-ts-fn",
    name: "Arrow function",
    prefix: "fn",
    language: "typescript",
    body: "const $1 = ($2) => {\n  $0\n};",
    description: "Arrow function expression",
  },
  {
    id: "builtin-ts-if",
    name: "If statement",
    prefix: "if",
    language: "typescript",
    body: "if ($1) {\n  $0\n}",
    description: "If block",
  },
  {
    id: "builtin-py-def",
    name: "Function definition",
    prefix: "def",
    language: "python",
    body: "def $1($2):\n    $0",
    description: "Python function",
  },
  {
    id: "builtin-rs-fn",
    name: "Rust function",
    prefix: "fn",
    language: "rust",
    body: "fn $1($2) -> $3 {\n    $0\n}",
    description: "Rust function",
  },
  {
    id: "builtin-go-fn",
    name: "Go function",
    prefix: "func",
    language: "go",
    body: "func $1($2) $3 {\n\t$0\n}",
    description: "Go function",
  },
];

export const LANGUAGE_OPTIONS = [
  "any",
  "typescript",
  "javascript",
  "python",
  "rust",
  "go",
  "html",
  "css",
  "json",
  "markdown",
  "shell",
  "java",
  "c",
  "cpp",
];
