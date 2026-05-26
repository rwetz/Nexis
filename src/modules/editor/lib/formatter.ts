import { invoke } from "@tauri-apps/api/core";
import { currentWorkspaceEnv } from "@/modules/workspace";
import type { CommandOutput } from "@/modules/ai/lib/native";
import type { FormatterConfig, FormatterLanguage } from "@/modules/settings/store";

const EXT_TO_LANG: Record<string, FormatterLanguage> = {
  js:   "javascript",
  mjs:  "javascript",
  cjs:  "javascript",
  jsx:  "javascript",
  ts:   "typescript",
  tsx:  "typescript",
  mts:  "typescript",
  cts:  "typescript",
  css:  "css",
  scss: "css",
  less: "css",
  html: "html",
  htm:  "html",
  json: "json",
  jsonc:"json",
  md:   "markdown",
  mdx:  "markdown",
  rs:   "rust",
  c:    "c",
  h:    "c",
  cpp:  "cpp",
  cc:   "cpp",
  cxx:  "cpp",
  hpp:  "cpp",
  py:   "python",
  pyw:  "python",
  go:   "go",
};

export function langForPath(path: string): FormatterLanguage | null {
  const normalized = path.replace(/\\/g, "/");
  const basename = normalized.split("/").pop() ?? "";
  const dot = basename.lastIndexOf(".");
  const ext = dot >= 0 ? basename.slice(dot + 1).toLowerCase() : "";
  return EXT_TO_LANG[ext] ?? null;
}

export type FormatResult = { ok: boolean; error?: string };

export async function formatFile(
  path: string,
  formatters: Record<FormatterLanguage, FormatterConfig>,
): Promise<FormatResult> {
  const lang = langForPath(path);
  if (!lang) return { ok: false, error: "No formatter configured for this file type" };

  const cfg = formatters[lang];
  if (!cfg.enabled) return { ok: false, error: "Formatter not enabled for this language" };

  const normalized = path.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  const basename = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  const dir = lastSlash >= 0 ? normalized.slice(0, lastSlash) : ".";

  const command = cfg.command.replace("{file}", basename);

  const result = await invoke<CommandOutput>("shell_run_command", {
    command,
    cwd: dir,
    timeoutSecs: 30,
    workspace: currentWorkspaceEnv(),
  });

  if (result.exit_code !== 0) {
    const errText = (result.stderr || result.stdout || "formatter exited with non-zero code").trim();
    return { ok: false, error: errText };
  }

  return { ok: true };
}
