// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * What Spotlight's preview can show for a path, decided by extension alone so
 * it is instant and needs no read. The read happens only for the kinds that
 * render content (code, text), and only under a size cap.
 */

export type PreviewKind = "image" | "code" | "text" | "binary";

export type CodeFamily = "c" | "hash" | "sql" | "markup";

const IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"]);
const TEXT = new Set(["md", "markdown", "mdx", "txt", "rst", "log", "csv", "env", "gitignore", "license"]);
const FONT = new Set(["ttf", "otf", "woff", "woff2", "eot"]);
const BINARY = new Set([
  ...FONT,
  "zip", "gz", "tgz", "7z", "rar", "exe", "dll", "so", "dylib", "bin", "wasm", "pdf", "docx", "xlsx",
  "pptx", "mp3", "mp4", "mov", "wav", "ogg", "webm", "db", "sqlite", "onnx", "gguf", "safetensors", "pt",
]);

/** Extension to [language label, comment family]. */
const CODE: Record<string, [string, CodeFamily]> = {
  ts: ["TypeScript", "c"], tsx: ["TypeScript React", "c"], js: ["JavaScript", "c"], jsx: ["JavaScript React", "c"],
  mjs: ["JavaScript", "c"], cjs: ["JavaScript", "c"], json: ["JSON", "c"], jsonc: ["JSON", "c"],
  rs: ["Rust", "c"], go: ["Go", "c"], java: ["Java", "c"], kt: ["Kotlin", "c"], swift: ["Swift", "c"],
  c: ["C", "c"], h: ["C header", "c"], cpp: ["C++", "c"], hpp: ["C++ header", "c"], cs: ["C#", "c"],
  css: ["CSS", "c"], scss: ["SCSS", "c"], php: ["PHP", "c"], dart: ["Dart", "c"], zig: ["Zig", "c"],
  py: ["Python", "hash"], rb: ["Ruby", "hash"], sh: ["Shell", "hash"], bash: ["Shell", "hash"],
  zsh: ["Shell", "hash"], ps1: ["PowerShell", "hash"], toml: ["TOML", "hash"], yaml: ["YAML", "hash"],
  yml: ["YAML", "hash"], r: ["R", "hash"], ex: ["Elixir", "hash"], exs: ["Elixir", "hash"],
  sql: ["SQL", "sql"], lua: ["Lua", "sql"], hs: ["Haskell", "sql"],
  html: ["HTML", "markup"], xml: ["XML", "markup"], vue: ["Vue", "markup"], svelte: ["Svelte", "markup"],
};

function extension(path: string): string {
  const lower = (path.split(/[\\/]/).pop() ?? "").toLowerCase();
  // Dotfiles named for what they are (.gitignore, .env) take their name as type.
  if (lower.startsWith(".") && !lower.slice(1).includes(".")) return lower.slice(1);
  if (lower === "license" || lower === "readme") return "txt";
  if (lower === "dockerfile" || lower === "makefile") return "sh";
  const dot = lower.lastIndexOf(".");
  return dot > 0 ? lower.slice(dot + 1) : "";
}

export function previewKind(path: string): PreviewKind {
  const ext = extension(path);
  if (IMAGE.has(ext)) return "image";
  if (ext in CODE) return "code";
  if (TEXT.has(ext)) return "text";
  if (BINARY.has(ext)) return "binary";
  // Unknown extensions are tried as text; the read itself rejects binary.
  return "text";
}

export function languageOf(path: string): { label: string; family: CodeFamily } | null {
  const hit = CODE[extension(path)];
  return hit ? { label: hit[0], family: hit[1] } : null;
}

/** A short type label for the meta row: "TypeScript", "PNG image", "Markdown". */
export function typeLabel(path: string): string {
  const ext = extension(path);
  const lang = CODE[ext]?.[0];
  if (lang) return lang;
  if (IMAGE.has(ext)) return `${ext.toUpperCase()} image`;
  if (ext === "md" || ext === "markdown" || ext === "mdx") return "Markdown";
  if (FONT.has(ext)) return "Font";
  return ext ? `${ext.toUpperCase()} file` : "File";
}

/** Inline markdown markers stripped, so an excerpt reads as prose. */
export function plainInline(line: string): string {
  return line
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|_)(.+?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1");
}
