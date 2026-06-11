// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/** Maps file extension to LSP languageId. */
export const EXT_TO_LANGUAGE_ID: Record<string, string> = {
  ts: "typescript",
  tsx: "typescriptreact",
  js: "javascript",
  jsx: "javascriptreact",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  pyw: "python",
  rs: "rust",
  go: "go",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  htm: "html",
  json: "json",
  jsonc: "jsonc",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  md: "markdown",
  lua: "lua",
  c: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  java: "java",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
};

export type ServerConfig = {
  cmd: string;
  args: string[];
  /** LSP language IDs this server handles (used for session grouping). */
  languages: string[];
  initializationOptions?: Record<string, unknown>;
};

/**
 * Known language server configurations, keyed by a stable group name.
 * Nexis will attempt to start the server only if its cmd is on PATH.
 */
export const LANGUAGE_SERVERS: Record<string, ServerConfig> = {
  typescript: {
    cmd: "typescript-language-server",
    args: ["--stdio"],
    languages: ["typescript", "typescriptreact", "javascript", "javascriptreact"],
  },
  pyright: {
    cmd: "pyright-langserver",
    args: ["--stdio"],
    languages: ["python"],
  },
  pylsp: {
    cmd: "pylsp",
    args: [],
    languages: ["python"],
  },
  "rust-analyzer": {
    cmd: "rust-analyzer",
    args: [],
    languages: ["rust"],
  },
  gopls: {
    cmd: "gopls",
    args: [],
    languages: ["go"],
  },
  "vscode-css": {
    cmd: "vscode-css-language-server",
    args: ["--stdio"],
    languages: ["css", "scss", "less"],
  },
  "vscode-html": {
    cmd: "vscode-html-language-server",
    args: ["--stdio"],
    languages: ["html"],
  },
  "vscode-json": {
    cmd: "vscode-json-language-server",
    args: ["--stdio"],
    languages: ["json", "jsonc"],
    initializationOptions: { provideFormatter: true },
  },
  lua: {
    cmd: "lua-language-server",
    args: [],
    languages: ["lua"],
  },
  clangd: {
    cmd: "clangd",
    args: [],
    languages: ["c", "cpp"],
  },
  // csharp-ls: a lightweight Roslyn-based server installed via
  // `dotnet tool install --global csharp-ls`. Speaks LSP over stdio with no
  // args. Resolves a solution/project from the workspace root automatically.
  "csharp-ls": {
    cmd: "csharp-ls",
    args: [],
    languages: ["csharp"],
  },
};

/** Return the server group name for a language ID, or null if none known. */
export function serverGroupForLanguage(languageId: string): string | null {
  for (const [group, config] of Object.entries(LANGUAGE_SERVERS)) {
    if (config.languages.includes(languageId)) return group;
  }
  return null;
}

/** Return the server config for a language ID, or null. */
export function serverForLanguage(languageId: string): ServerConfig | null {
  const group = serverGroupForLanguage(languageId);
  return group ? LANGUAGE_SERVERS[group] ?? null : null;
}

/** Get the LSP language ID from a file path. */
export function languageIdForPath(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext ? (EXT_TO_LANGUAGE_ID[ext] ?? null) : null;
}
