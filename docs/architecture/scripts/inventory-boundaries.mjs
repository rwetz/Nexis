// Read-only source census for Phase 0. Run from the repository root with Node.
// The only output written is the adjacent inventory JSONL; this is not a guard.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
// Use the parser already installed with the React/Vite toolchain. TS 7 no
// longer exposes createSourceFile; no dependency or lockfile change is needed.
const require = createRequire(path.join(root, "package.json"));
const viteRequire = createRequire(require.resolve("@vitejs/plugin-react"));
const babelRequire = createRequire(viteRequire.resolve("@babel/core"));
const { parse } = babelRequire("@babel/parser");
const files = execFileSync("rg", ["--files", "src", "src-tauri/src"], {
  cwd: root, encoding: "utf8", windowsHide: true,
}).trim().split(/\r?\n/).map((f) => f.replaceAll("\\", "/")).sort();
const rows = [];
const platformModules = new Set(["workspace", "settings", "window", "notifications", "updater"]);
const workbenchModules = new Set(["tabs", "sidebar", "header", "statusbar", "shortcuts", "recent-files"]);
const rustPlatform = new Set(["proc", "workspace", "fs", "fswatch", "autosave", "snapshots", "secrets", "winstate", "crash", "diagnostics", "job", "tools", "net"]);

function owner(file) {
  const module = file.match(/^(?:src|src-tauri\/src)\/modules\/([^/.]+)/)?.[1];
  if (file.startsWith("src-tauri/")) return module ? (rustPlatform.has(module) ? "platform" : "capability") : "platform";
  if (module === "theme" || file.startsWith("src/styles/") || /^src\/components\/(?:icon|ui\/)/.test(file)) return "design";
  if (platformModules.has(module) || /^src\/lib\/(?:path|platform|launchDir|externalTools|missingTools)/.test(file)) return "platform";
  if (workbenchModules.has(module) || /^(src\/app\/|src\/lib\/plugins\/|src\/lib\/(?:packs|onboarding)|src\/main|src\/components\/(?:CommandPalette|QuickFilePicker|WorkspaceSearch|ShellHistoryOverlay))/.test(file)) return "workbench";
  if (/^src\/components\/Window/.test(file)) return "platform";
  if (module || file.startsWith("src/plugins/") || file.startsWith("src/components/ai-elements/")) return "capability";
  return file.startsWith("src/settings/") ? "workbench" : "design";
}
function unit(file) {
  return file.match(/^(src\/modules\/[^/]+|src-tauri\/src\/modules\/[^/.]+|src\/lib\/plugins|src\/plugins\/[^/]+)/)?.[1] ?? file.split("/").slice(0, 2).join("/");
}
function add(file, line, kind, detail, concern = "platform", extra = {}) {
  rows.push({ file, line, kind, owner: owner(file), concern, detail, ...extra });
}
function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  if (typeof node.type === "string") visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "comments", "tokens", "errors"].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((n) => walk(n, visit));
    else if (value && typeof value === "object") walk(value, visit);
  }
}

let frontendFiles = 0;
let rustFiles = 0;
for (const file of files) {
  const source = readFileSync(path.join(root, file), "utf8");
  const test = /(?:\.test\.|\.spec\.|\/test\/)/.test(file);
  if (/\.[cm]?[jt]sx?$/.test(file) && !file.endsWith(".d.ts")) {
    frontendFiles++;
    add(file, 1, "source-file", unit(file), owner(file), { test });
    const ast = parse(source, { sourceType: "unambiguous", plugins: ["typescript", "jsx"], createImportExpressions: true });
    const imports = new Map();
    const snippet = (n) => source.slice(n.start, n.end).replace(/\s+/g, " ");
    function record(n, kind, detail, concern = "platform", extra = {}) {
      add(file, n.loc.start.line, kind, detail, concern, { test, ...extra });
    }
    function importSite(n, specifier, form) {
      if (typeof specifier !== "string") return;
      if (specifier.startsWith("@tauri-apps/")) record(n, "tauri-import", specifier, "platform", { form });
      if (/^(?:@phosphor-icons\/|lucide|@iconify-json\/)/.test(specifier)) record(n, "icon-vendor-import", specifier, "design", { form });
      if (/^(?:@tauri-apps\/plugin-store|zustand(?:\/|$))/.test(specifier)) record(n, "store-import", specifier, specifier.includes("tauri") ? "platform" : owner(file), { form });
      const target = specifier.startsWith("@/") ? `src/${specifier.slice(2)}` : specifier.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)) : null;
      if (target && unit(file) !== unit(target)) record(n, "cross-module-import", specifier, owner(target), { target, targetOwner: owner(target), form });
    }
    walk(ast, (n) => {
      if (n.type === "ImportDeclaration") {
        for (const s of n.specifiers) imports.set(s.local.name, { source: n.source.value, name: s.imported?.name ?? s.type });
        importSite(n, n.source.value, n.importKind === "type" ? "type" : "static");
      } else if (["ExportNamedDeclaration", "ExportAllDeclaration"].includes(n.type) && n.source) {
        importSite(n, n.source.value, "re-export");
      } else if (n.type === "ImportExpression") importSite(n, n.source.value, "dynamic");
      else if (n.type === "TSImportType") importSite(n, n.argument?.value, "type");
    });
    walk(ast, (n) => {
      if (!["CallExpression", "OptionalCallExpression", "NewExpression"].includes(n.type)) return;
      const callee = snippet(n.callee);
      const name = n.callee.name ?? n.callee.property?.name;
      const binding = imports.get(n.callee.name);
      // Fallback names include destructuring from dynamic Tauri imports.
      if (name === "invoke" || binding?.name === "invoke") {
        const command = n.arguments[0]?.value ?? snippet(n.arguments[0]);
        record(n, "invoke", String(command), "platform", { argumentKind: n.arguments[0]?.type === "StringLiteral" ? "literal" : "expression" });
        if (/^(?:fs_|list_subdirs|editor_autosave_|session_snapshot_|save_cast_recording)/.test(command)) record(n, "filesystem-ipc", String(command));
      }
      if (["listen", "once", "emit", "emitTo", "emitToAll", "onDragDropEvent", "onCloseRequested", "onResized", "onMoved", "onFocusChanged", "onScaleChanged", "onThemeChanged"].includes(name) && (binding?.source.startsWith("@tauri-apps/") || source.includes("@tauri-apps/"))) {
        record(n, "event-candidate", `${callee}(${n.arguments[0] ? snippet(n.arguments[0]).slice(0, 180) : ""})`);
      }
      if (name === "Channel" || binding?.name === "Channel") record(n, "ipc-channel", callee);
      if (/^native\.(?:readFile|readFileAi|writeFile|writeFileBytes|canonicalize|createFile|createDir|readDir|grep|glob|stat|rename|delete|listFiles|search|fsWatchStart|fsWatchStop)$/.test(callee)) record(n, "filesystem-bridge-consumer", callee);
      if (/\b(?:localStorage|sessionStorage)\b/.test(callee) || /^(?:LazyStore|Store)$/.test(callee) || /^(?:store|s)\.(?:get|set|save|load|delete|onChange)$/.test(callee) || binding?.source === "@tauri-apps/plugin-store" || binding?.source === "zustand/middleware") record(n, "persistence-access", callee);
      if (["getState", "setState", "subscribe"].includes(name) || /^use\w*Store$/.test(callee) || binding?.source === "zustand") record(n, "state-access", callee, owner(file));
    });
  } else if (file.endsWith(".rs")) {
    rustFiles++;
    add(file, 1, "source-file", unit(file), owner(file), { scope: "rust-including-inline-tests" });
    const lines = source.split(/\r?\n/);
    // Rust is a lexical candidate census, deliberately not an AST/type audit.
    // Keep test code and receiver-ambiguous I/O/spawn calls for manual review.
    lines.forEach((line, i) => {
      if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return;
      const detail = line.trim();
      const record = (kind, concern = "platform") => add(file, i + 1, kind, detail, concern, { scope: "rust-including-inline-tests" });
      if (/\b(?:Command::new|proc::command|command|new_command|env_command|wsl_exec_capture|wsl_command|spawn_command)\s*\(|\.(?:spawn|output|status)\s*\(|\bSharedChild::spawn\s*\(/.test(line)) record("process-candidate");
      if (/\b(?:std::fs|fs|File|OpenOptions|NamedTempFile|tempfile|WalkDir|WalkBuilder)::|\.(?:read|write|flush|read_to_string|read_to_end|read_exact|read_line|write_all|write_fmt|sync_all|set_len|persist|persist_noclobber|metadata|symlink_metadata|read_dir|read_link|canonicalize|try_exists|is_file|is_dir|exists)\s*\(/.test(line)) record("filesystem-candidate");
      if (/\.(?:emit|emit_to|emit_filter|listen|listen_any|once|once_any)(?:\s*::\s*<[^;]+>)?\s*\(/.test(line)) record("event-candidate");
      if (/\bcrate::modules::|\buse\s+super::super/.test(line)) record("cross-module-reference-candidate", owner(file));
      if (/^\s*#\[tauri::command/.test(line)) record("command-adapter");
    });
  }
}
rows.sort((a, b) => a.file.localeCompare(b.file, "en") || a.line - b.line || a.kind.localeCompare(b.kind, "en"));
const meta = { kind: "metadata", head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim(), frontendFiles, rustFiles, records: rows.length };
const output = path.join(root, "docs/architecture/nexis-boundary-inventory.jsonl");
writeFileSync(output, [meta, ...rows].map((row) => JSON.stringify(row)).join("\n") + "\n");
const counts = {};
for (const row of rows) {
  const key = `${row.kind}:${row.test ? "test" : row.scope ? "rust-mixed" : "production"}`;
  counts[key] = (counts[key] ?? 0) + 1;
}
console.log(JSON.stringify({ ...meta, counts }, null, 2));
