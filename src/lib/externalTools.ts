// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The graceful-degradation matrix: every external binary Nexis can use but
 * does not ship, what its absence costs, and how to install it.
 *
 * Nexis deliberately shells out rather than bundling language servers,
 * debuggers, formatters, or git — that is what keeps the binary small (~10 MB)
 * and lets each tool update on its own schedule.
 * The failure mode of that choice is silence: a missing `rust-analyzer` used
 * to mean completions simply never appeared, with nothing anywhere saying
 * why. This module is the data that turns each of those silent no-ops into a
 * statement the user can act on.
 *
 * It is pure data plus lookup so the matrix can be asserted in tests — the
 * point of the feature is coverage, and coverage is only meaningful if
 * something checks that every tool we can miss is actually described here.
 */

export type ToolCategory = "language-server" | "debugger" | "formatter" | "vcs";

export type Platform = "linux" | "macos" | "windows";

export type ExternalTool = {
  /** Stable id. For language servers this matches the LANGUAGE_SERVERS key. */
  id: string;
  /** The binary name, as invoked. */
  binary: string;
  /** Human name for the UI. */
  name: string;
  category: ToolCategory;
  /**
   * What stops working without it, in user terms. Not "the LSP client fails
   * to start" — what the user notices, which is what makes the notice useful.
   */
  enables: string;
  /** Install command per platform. Omit a platform where none is sensible. */
  install: Partial<Record<Platform, string>>;
  /** Where to read more, when an install command isn't the whole story. */
  docsUrl?: string;
  /**
   * Which machine Nexis actually spawns this tool on, which is not always the
   * one the workspace lives on. The LSP client spawns servers host-side
   * regardless of workspace; git follows the workspace into WSL. Re-checking a
   * tool in the wrong environment answers for a machine it will never run on
   * (CLAUDE.md pitfall #20) — telling a WSL user their host `rust-analyzer`
   * is fine when the one that matters is the host one, or worse, the reverse.
   */
  runsIn: "host" | "workspace";
};

/**
 * Keyed by tool id. Language-server ids intentionally match the keys of
 * `LANGUAGE_SERVERS` in `modules/lsp/languages.ts`; a test asserts every
 * server there has an entry here, so adding a server without an install hint
 * fails the build rather than silently reintroducing the silent-no-op.
 */
export const EXTERNAL_TOOLS: Record<string, ExternalTool> = {
  // ── Language servers ──────────────────────────────────────────────────
  typescript: {
    id: "typescript",
    binary: "typescript-language-server",
    name: "TypeScript Language Server",
    category: "language-server",
    runsIn: "host",
    enables: "Completions, diagnostics, and go-to-definition in TS/JS files",
    install: {
      linux: "npm i -g typescript typescript-language-server",
      macos: "npm i -g typescript typescript-language-server",
      windows: "npm i -g typescript typescript-language-server",
    },
  },
  pyright: {
    id: "pyright",
    binary: "pyright-langserver",
    name: "Pyright",
    category: "language-server",
    runsIn: "host",
    enables: "Type checking and completions in Python files",
    install: {
      linux: "npm i -g pyright",
      macos: "npm i -g pyright",
      windows: "npm i -g pyright",
    },
  },
  pylsp: {
    id: "pylsp",
    binary: "pylsp",
    name: "Python LSP Server",
    category: "language-server",
    runsIn: "host",
    enables: "Completions and diagnostics in Python files",
    install: {
      linux: "pipx install 'python-lsp-server[all]'",
      macos: "pipx install 'python-lsp-server[all]'",
      windows: "pipx install python-lsp-server[all]",
    },
  },
  "rust-analyzer": {
    id: "rust-analyzer",
    binary: "rust-analyzer",
    name: "rust-analyzer",
    category: "language-server",
    runsIn: "host",
    enables: "Completions, diagnostics, and inlay hints in Rust files",
    install: {
      linux: "rustup component add rust-analyzer",
      macos: "rustup component add rust-analyzer",
      windows: "rustup component add rust-analyzer",
    },
  },
  gopls: {
    id: "gopls",
    binary: "gopls",
    name: "gopls",
    category: "language-server",
    runsIn: "host",
    enables: "Completions and diagnostics in Go files",
    install: {
      linux: "go install golang.org/x/tools/gopls@latest",
      macos: "go install golang.org/x/tools/gopls@latest",
      windows: "go install golang.org/x/tools/gopls@latest",
    },
  },
  "vscode-css": {
    id: "vscode-css",
    binary: "vscode-css-language-server",
    name: "CSS Language Server",
    category: "language-server",
    runsIn: "host",
    enables: "Completions and diagnostics in CSS/SCSS/Less files",
    install: {
      linux: "npm i -g vscode-langservers-extracted",
      macos: "npm i -g vscode-langservers-extracted",
      windows: "npm i -g vscode-langservers-extracted",
    },
  },
  "vscode-html": {
    id: "vscode-html",
    binary: "vscode-html-language-server",
    name: "HTML Language Server",
    category: "language-server",
    runsIn: "host",
    enables: "Completions in HTML files",
    install: {
      linux: "npm i -g vscode-langservers-extracted",
      macos: "npm i -g vscode-langservers-extracted",
      windows: "npm i -g vscode-langservers-extracted",
    },
  },
  "vscode-json": {
    id: "vscode-json",
    binary: "vscode-json-language-server",
    name: "JSON Language Server",
    category: "language-server",
    runsIn: "host",
    enables: "Schema validation and completions in JSON files",
    install: {
      linux: "npm i -g vscode-langservers-extracted",
      macos: "npm i -g vscode-langservers-extracted",
      windows: "npm i -g vscode-langservers-extracted",
    },
  },

  lua: {
    id: "lua",
    binary: "lua-language-server",
    name: "Lua Language Server",
    category: "language-server",
    runsIn: "host",
    enables: "Completions and diagnostics in Lua files",
    install: {
      linux: "sudo apt install lua-language-server   # or download a release",
      macos: "brew install lua-language-server",
      windows: "scoop install lua-language-server",
    },
    docsUrl: "https://luals.github.io/#install",
  },
  clangd: {
    id: "clangd",
    binary: "clangd",
    name: "clangd",
    category: "language-server",
    runsIn: "host",
    enables: "Completions and diagnostics in C/C++ files",
    install: {
      linux: "sudo apt install clangd",
      macos: "brew install llvm   # clangd ships with LLVM",
      windows: "winget install --id LLVM.LLVM",
    },
  },
  "csharp-ls": {
    id: "csharp-ls",
    binary: "csharp-ls",
    name: "csharp-ls",
    category: "language-server",
    runsIn: "host",
    enables: "Completions and diagnostics in C# files",
    install: {
      linux: "dotnet tool install --global csharp-ls",
      macos: "dotnet tool install --global csharp-ls",
      windows: "dotnet tool install --global csharp-ls",
    },
  },

  // ── Version control ───────────────────────────────────────────────────
  git: {
    id: "git",
    binary: "git",
    name: "Git",
    category: "vcs",
    runsIn: "workspace",
    enables:
      "The Source Control panel, diffs, blame, and branch switching. Without it Nexis works, but every git surface stays empty",
    install: {
      linux: "sudo apt install git   # or your distro's package manager",
      macos: "brew install git   # or: xcode-select --install",
      windows: "winget install --id Git.Git",
    },
    docsUrl: "https://git-scm.com/downloads",
  },
};

/** Every tool id the matrix knows about. */
export function knownToolIds(): string[] {
  return Object.keys(EXTERNAL_TOOLS);
}

export function toolById(id: string): ExternalTool | null {
  return EXTERNAL_TOOLS[id] ?? null;
}

/**
 * Detect the current platform from the user agent.
 *
 * A best-effort read, defaulting to Linux: this only selects which install
 * command to *show*, so a wrong guess is a cosmetic annoyance rather than a
 * failure, and it must never throw in a non-browser (test) environment.
 */
export function currentPlatform(): Platform {
  const ua =
    typeof navigator !== "undefined" ? navigator.userAgent.toLowerCase() : "";
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  return "linux";
}

/**
 * The install command to show for a tool, or null when the matrix has no
 * suggestion for this platform (callers fall back to `docsUrl`).
 */
export function installHint(
  tool: ExternalTool,
  platform: Platform = currentPlatform(),
): string | null {
  return tool.install[platform] ?? null;
}
