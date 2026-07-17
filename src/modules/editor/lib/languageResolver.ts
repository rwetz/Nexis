// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import type { Extension } from "@codemirror/state";
import { delimiterLinter, DELIMITER_CHECK_EXTENSIONS } from "./linting";

type LoaderResult = Extension | { token: unknown };
type LanguageLoader = () => Promise<LoaderResult>;

const rubyLoader: LanguageLoader = () =>
  import("@codemirror/legacy-modes/mode/ruby").then((m) => m.ruby);

const jsonLoader: LanguageLoader = () =>
  import("@codemirror/lang-json").then((m) => m.json());

const sqlLoader: LanguageLoader = () =>
  import("@codemirror/legacy-modes/mode/sql").then((m) => m.standardSQL);
const pgsqlLoader: LanguageLoader = () =>
  import("@codemirror/legacy-modes/mode/sql").then((m) => m.pgSQL);
const mysqlLoader: LanguageLoader = () =>
  import("@codemirror/legacy-modes/mode/sql").then((m) => m.mySQL);
const sqliteLoader: LanguageLoader = () =>
  import("@codemirror/legacy-modes/mode/sql").then((m) => m.sqlite);
const mariadbLoader: LanguageLoader = () =>
  import("@codemirror/legacy-modes/mode/sql").then((m) => m.mariaDB);
const mssqlLoader: LanguageLoader = () =>
  import("@codemirror/legacy-modes/mode/sql").then((m) => m.msSQL);
const plsqlLoader: LanguageLoader = () =>
  import("@codemirror/legacy-modes/mode/sql").then((m) => m.plSQL);

const kotlinLoader: LanguageLoader = () =>
  import("@codemirror/legacy-modes/mode/clike").then((m) => m.kotlin);
const scalaLoader: LanguageLoader = () =>
  import("@codemirror/legacy-modes/mode/clike").then((m) => m.scala);
const dartLoader: LanguageLoader = () =>
  import("@codemirror/legacy-modes/mode/clike").then((m) => m.dart);
const nginxLoader: LanguageLoader = () =>
  import("@codemirror/legacy-modes/mode/nginx").then((m) => m.nginx);
const graphqlLoader: LanguageLoader = () =>
  import("cm6-graphql").then((m) => m.graphqlLanguageSupport());

/**
 * Extension → loader. Each loader is a dynamic import so language packs
 * only enter the bundle when a matching file is opened.
 *
 * Loaders may return either a ready Extension (lang-* packages) or a raw
 * StreamParser (legacy-modes). `resolveLanguage` wraps the latter in
 * StreamLanguage before returning.
 */
const loaders: Record<string, LanguageLoader> = {
  // JavaScript / TypeScript family
  js: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  jsx: () =>
    import("@codemirror/lang-javascript").then((m) =>
      m.javascript({ jsx: true }),
    ),
  mjs: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  cjs: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  ts: () =>
    import("@codemirror/lang-javascript").then((m) =>
      m.javascript({ typescript: true }),
    ),
  tsx: () =>
    import("@codemirror/lang-javascript").then((m) =>
      m.javascript({ jsx: true, typescript: true }),
    ),

  // Vue / Svelte — HTML is the closest available grammar (handles template/script/style blocks)
  vue: () => import("@codemirror/lang-html").then((m) => m.html()),
  svelte: () => import("@codemirror/lang-html").then((m) => m.html()),

  rs: () => import("@codemirror/lang-rust").then((m) => m.rust()),
  go: () => import("@codemirror/lang-go").then((m) => m.go()),
  py: () => import("@codemirror/lang-python").then((m) => m.python()),
  pyw: () => import("@codemirror/lang-python").then((m) => m.python()),
  json: jsonLoader,
  jsonc: jsonLoader,
  json5: jsonLoader,

  sql: sqlLoader,
  psql: pgsqlLoader,
  pgsql: pgsqlLoader,
  mysql: mysqlLoader,
  sqlite: sqliteLoader,
  mariadb: mariadbLoader,
  mssql: mssqlLoader,
  plsql: plsqlLoader,

  // GraphQL
  graphql: graphqlLoader,
  gql: graphqlLoader,

  md: () => import("@codemirror/lang-markdown").then((m) => m.markdown()),
  markdown: () => import("@codemirror/lang-markdown").then((m) => m.markdown()),

  html: () => import("@codemirror/lang-html").then((m) => m.html()),
  htm: () => import("@codemirror/lang-html").then((m) => m.html()),
  css: () => import("@codemirror/lang-css").then((m) => m.css()),
  // SCSS: sass legacy mode handles brace-based SCSS syntax
  scss: () => import("@codemirror/legacy-modes/mode/sass").then((m) => m.sass),

  php: () => import("@codemirror/lang-php").then((m) => m.php({ plain: true })),
  rb: rubyLoader,
  rake: rubyLoader,
  gemspec: rubyLoader,
  ru: rubyLoader,

  // C / C++ family — Lezer grammar (produces error nodes for syntaxLinter).
  // lang-cpp's grammar covers C as well; there is no separate C package.
  c: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  h: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  cpp: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  cc: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  cxx: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  hpp: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  hxx: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),

  // Java — Lezer grammar (produces error nodes for syntaxLinter).
  java: () => import("@codemirror/lang-java").then((m) => m.java()),

  // C#
  cs: () => import("@codemirror/legacy-modes/mode/clike").then((m) => m.csharp),

  // Kotlin
  kt: kotlinLoader,
  kts: kotlinLoader,

  // Scala
  scala: scalaLoader,

  // Dart
  dart: dartLoader,

  // Lua
  lua: () => import("@codemirror/legacy-modes/mode/lua").then((m) => m.lua),

  // Haskell
  hs: () =>
    import("@codemirror/legacy-modes/mode/haskell").then((m) => m.haskell),

  // R
  r: () => import("@codemirror/legacy-modes/mode/r").then((m) => m.r),

  // PowerShell
  ps1: () =>
    import("@codemirror/legacy-modes/mode/powershell").then(
      (m) => m.powerShell,
    ),

  // Swift
  swift: () =>
    import("@codemirror/legacy-modes/mode/swift").then((m) => m.swift),

  // Nginx / generic config files
  conf: nginxLoader,

  // Protocol Buffers
  proto: () =>
    import("@codemirror/legacy-modes/mode/protobuf").then((m) => m.protobuf),

  // Elixir — Erlang grammar is the closest available (shared atom/module token structure)
  ex: () =>
    import("@codemirror/legacy-modes/mode/erlang").then((m) => m.erlang),
  exs: () =>
    import("@codemirror/legacy-modes/mode/erlang").then((m) => m.erlang),

  // Shell family
  sh: () => import("@codemirror/legacy-modes/mode/shell").then((m) => m.shell),
  bash: () =>
    import("@codemirror/legacy-modes/mode/shell").then((m) => m.shell),
  zsh: () => import("@codemirror/legacy-modes/mode/shell").then((m) => m.shell),
  toml: () => import("@codemirror/legacy-modes/mode/toml").then((m) => m.toml),
  yaml: () => import("@codemirror/legacy-modes/mode/yaml").then((m) => m.yaml),
  yml: () => import("@codemirror/legacy-modes/mode/yaml").then((m) => m.yaml),
  dockerfile: () =>
    import("@codemirror/legacy-modes/mode/dockerfile").then(
      (m) => m.dockerFile,
    ),
};

const filenameOverrides: Record<string, LanguageLoader> = {
  dockerfile: loaders.dockerfile!,
  "dockerfile.dev": loaders.dockerfile!,
  "nginx.conf": nginxLoader,
  gemfile: rubyLoader,
  rakefile: rubyLoader,
  podfile: rubyLoader,
  fastfile: rubyLoader,
  guardfile: rubyLoader,
  brewfile: rubyLoader,
};

function extOf(name: string): string | null {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot === -1 || dot === lower.length - 1) return null;
  return lower.slice(dot + 1);
}

function isStreamParser(v: unknown): boolean {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { token?: unknown }).token === "function"
  );
}

const CACHE_MAX = 256;
const cache = new Map<string, Extension | null>();

function cacheKey(filename: string): string | null {
  const lower = filename.toLowerCase();
  const base = lower.split("/").pop() ?? lower;
  if (filenameOverrides[base]) return `name:${base}`;
  const ext = extOf(base);
  return ext ? `ext:${ext}` : null;
}

export function resolveLanguageSync(filename: string): Extension | null {
  const key = cacheKey(filename);
  return key ? (cache.get(key) ?? null) : null;
}

async function loadExtension(
  key: string,
  loader: LanguageLoader,
  extName: string | null,
): Promise<Extension | null> {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const result = await loader();
  let ext: Extension;
  if (isStreamParser(result)) {
    const { StreamLanguage } = await import("@codemirror/language");
    const lang = StreamLanguage.define(
      result as Parameters<typeof StreamLanguage.define>[0],
    );
    // StreamParser languages have no error nodes, so pair them with the
    // bracket-balance linter where brackets are reliably balanced.
    ext =
      extName && DELIMITER_CHECK_EXTENSIONS.has(extName)
        ? [lang, delimiterLinter()]
        : lang;
  } else {
    ext = result as Extension;
  }
  if (cache.size >= CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, ext);
  return ext;
}

/**
 * Resolve the CodeMirror language for a file. `overrideId` (a `loaders` key,
 * or `"plain"` for no highlighting) takes precedence over detection — it
 * backs the per-file language dropdown in the editor pane header.
 */
export async function resolveLanguage(
  filename: string,
  overrideId?: string | null,
): Promise<Extension | null> {
  if (overrideId === PLAIN_LANGUAGE_ID) return null;
  if (overrideId && loaders[overrideId]) {
    return loadExtension(`ext:${overrideId}`, loaders[overrideId], overrideId);
  }

  const key = cacheKey(filename);
  if (!key) return null;

  const lower = filename.toLowerCase();
  const base = lower.split("/").pop() ?? lower;
  const loader = filenameOverrides[base] ?? loaders[extOf(base) ?? ""];
  if (!loader) {
    cache.set(key, null);
    return null;
  }
  return loadExtension(key, loader, extOf(base));
}

export function preloadLanguages(filenames: string[]): void {
  for (const f of filenames) {
    void resolveLanguage(f).catch(() => {});
  }
}

/** Override id meaning "no syntax highlighting". */
export const PLAIN_LANGUAGE_ID = "plain";

/**
 * Curated choices for the per-file language dropdown. Each id is a `loaders`
 * key (one representative extension per language) except `plain`.
 */
export const LANGUAGE_CHOICES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "cs", label: "C#" },
  { id: "css", label: "CSS" },
  { id: "dart", label: "Dart" },
  { id: "dockerfile", label: "Dockerfile" },
  { id: "ex", label: "Elixir" },
  { id: "go", label: "Go" },
  { id: "graphql", label: "GraphQL" },
  { id: "hs", label: "Haskell" },
  { id: "html", label: "HTML" },
  { id: "java", label: "Java" },
  { id: "js", label: "JavaScript" },
  { id: "jsx", label: "JSX" },
  { id: "json", label: "JSON" },
  { id: "kt", label: "Kotlin" },
  { id: "lua", label: "Lua" },
  { id: "md", label: "Markdown" },
  { id: "conf", label: "Nginx" },
  { id: "php", label: "PHP" },
  { id: "ps1", label: "PowerShell" },
  { id: "proto", label: "Protobuf" },
  { id: "py", label: "Python" },
  { id: "r", label: "R" },
  { id: "rb", label: "Ruby" },
  { id: "rs", label: "Rust" },
  { id: "scala", label: "Scala" },
  { id: "scss", label: "SCSS" },
  { id: "sh", label: "Shell" },
  { id: "sql", label: "SQL" },
  { id: "svelte", label: "Svelte" },
  { id: "swift", label: "Swift" },
  { id: "toml", label: "TOML" },
  { id: "tsx", label: "TSX" },
  { id: "ts", label: "TypeScript" },
  { id: "vue", label: "Vue" },
  { id: "yaml", label: "YAML" },
];

/** Filename-based detections mapped back to a representative choice id. */
const filenameToChoiceId: Record<string, string> = {
  dockerfile: "dockerfile",
  "dockerfile.dev": "dockerfile",
  "nginx.conf": "conf",
  gemfile: "rb",
  rakefile: "rb",
  podfile: "rb",
  fastfile: "rb",
  guardfile: "rb",
  brewfile: "rb",
};

/**
 * The loader key detection would pick for this file, or null when the file
 * has no known language. Drives the dropdown's "Auto" label.
 */
export function detectedLanguageId(filename: string): string | null {
  const lower = filename.toLowerCase();
  const base = lower.split("/").pop() ?? lower;
  if (filenameToChoiceId[base]) return filenameToChoiceId[base];
  const ext = extOf(base);
  return ext && loaders[ext] ? ext : null;
}

/** Display label for a loader key (falls back to the raw id). */
export function languageLabel(id: string | null): string {
  if (!id || id === PLAIN_LANGUAGE_ID) return "Plain Text";
  return LANGUAGE_CHOICES.find((c) => c.id === id)?.label ?? id;
}
