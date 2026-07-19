// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import {
  DEFAULT_AUTOCOMPLETE_MODEL,
  DEFAULT_MODEL_ID,
  LMSTUDIO_DEFAULT_BASE_URL,
  MLX_DEFAULT_BASE_URL,
  OLLAMA_DEFAULT_BASE_URL,
  VLLM_DEFAULT_BASE_URL,
  XLLM_DEFAULT_BASE_URL,
  SGLANG_DEFAULT_BASE_URL,
  OPENAI_COMPATIBLE_DEFAULT_BASE_URL,
  type AutocompleteProviderId,
  type ModelId,
} from "@/modules/ai/config";
import { isPackId, PACK_IDS, type PackId } from "@/lib/packs";
import {
  clampQuickTerminalHeight,
  DEFAULT_QUICK_TERMINAL_HOTKEY,
  QUICK_TERMINAL_DEFAULT_HEIGHT,
} from "@/modules/window/quickTerminalConfig";
import type { KeyBinding, ShortcutId } from "@/modules/shortcuts/shortcuts";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { LazyStore } from "@tauri-apps/plugin-store";

export type ThemePref = "system" | "light" | "dark";

export const DEFAULT_THEME_ID = "nexis-default";

export type BackgroundKind = "none" | "image" | "animated";

export type AnimatedBgId = "aurora" | "particles" | "threads";

export const EDITOR_THEMES = [
  "atomone",
  "aura",
  "copilot",
  "github-dark",
  "github-light",
  "nord",
  "tokyo-night",
  "xcode-dark",
  "xcode-light",
] as const;

export type EditorThemeId = (typeof EDITOR_THEMES)[number];

export const EDITOR_THEME_LABELS: Record<EditorThemeId, string> = {
  atomone: "Atom One",
  aura: "Aura",
  copilot: "Copilot",
  "github-dark": "GitHub Dark",
  "github-light": "GitHub Light",
  nord: "Nord",
  "tokyo-night": "Tokyo Night",
  "xcode-dark": "Xcode Dark",
  "xcode-light": "Xcode Light",
};

export type FormatterLanguage =
  | "javascript"
  | "typescript"
  | "css"
  | "html"
  | "json"
  | "markdown"
  | "rust"
  | "c"
  | "cpp"
  | "python"
  | "go";

export type FormatterConfig = {
  command: string;
  enabled: boolean;
};

/** Per-tool approval behavior. `"auto-safe"` (offered for `bash_run` only)
 * auto-approves commands passing `checkAutoApprove` in `ai/lib/security.ts`
 * — a strict read-only allowlist — and prompts for everything else. */
export type ToolApprovalPolicy = "auto" | "auto-safe" | "prompt" | "deny";

export type TerminalCursorStyle = "bar" | "block" | "underline";

export const TERMINAL_CURSOR_STYLE_LABELS: Record<TerminalCursorStyle, string> = {
  bar: "Bar",
  block: "Block",
  underline: "Underline",
};

export const FORMATTER_LANGUAGE_LABELS: Record<FormatterLanguage, string> = {
  javascript: "JavaScript / JSX",
  typescript: "TypeScript / TSX",
  css: "CSS / SCSS / Less",
  html: "HTML",
  json: "JSON",
  markdown: "Markdown",
  rust: "Rust",
  c: "C",
  cpp: "C++",
  python: "Python",
  go: "Go",
};

export const DEFAULT_FORMATTERS: Record<FormatterLanguage, FormatterConfig> = {
  javascript: { command: 'prettier --write "{file}"', enabled: false },
  typescript: { command: 'prettier --write "{file}"', enabled: false },
  css:        { command: 'prettier --write "{file}"', enabled: false },
  html:       { command: 'prettier --write "{file}"', enabled: false },
  json:       { command: 'prettier --write "{file}"', enabled: false },
  markdown:   { command: 'prettier --write "{file}"', enabled: false },
  rust:       { command: 'rustfmt "{file}"', enabled: false },
  c:          { command: 'clang-format -i "{file}"', enabled: false },
  cpp:        { command: 'clang-format -i "{file}"', enabled: false },
  python:     { command: 'black "{file}"', enabled: false },
  go:         { command: 'gofmt -w "{file}"', enabled: false },
};

export type Preferences = {
  theme: ThemePref;
  themeId: string;
  backgroundKind: BackgroundKind;
  backgroundImageId: string | null;
  backgroundAnimatedId: AnimatedBgId | null;
  backgroundOpacity: number;
  backgroundBlur: number;
  defaultModelId: ModelId;
  editorTheme: EditorThemeId;
  customInstructions: string;
  autostart: boolean;
  restoreWindowState: boolean;
  restoreTabs: boolean;
  autocompleteEnabled: boolean;
  autocompleteProvider: AutocompleteProviderId;
  autocompleteModelId: string;
  lmstudioBaseURL: string;
  lmstudioModelId: string;
  mlxBaseURL: string;
  mlxModelId: string;
  ollamaBaseURL: string;
  ollamaModelId: string;
  vllmBaseURL: string;
  vllmModelId: string;
  xllmBaseURL: string;
  xllmModelId: string;
  sglangBaseURL: string;
  sglangModelId: string;
  openaiCompatibleBaseURL: string;
  openaiCompatibleModelId: string;
  openaiCompatibleContextLimit: number;
  favoriteModelIds: string[];
  recentModelIds: string[];
  vimMode: boolean;
  showHidden: boolean;
  terminalWebglEnabled: boolean;
  terminalFontFamily: string;
  terminalLetterSpacing: number;
  terminalFontSize: number;
  /** CSS font-weight for regular terminal text (bold text stays bold). */
  terminalFontWeight: number;
  /** Full path of the shell for new terminals; "" = auto-detect (login
   * shell / $SHELL on unix, pwsh → powershell → cmd on Windows). A path
   * that doesn't exist falls back to auto-detection Rust-side. */
  defaultShellPath: string;
  terminalScrollback: number;
  lastWslDistro: string | null;
  zoomLevel: number;
  shortcuts: Record<ShortcutId, KeyBinding[]>;
  terminalEnvVars: Record<string, string>;
  formatters: Record<FormatterLanguage, FormatterConfig>;
  formatOnSave: boolean;
  terminalSuggestionsEnabled: boolean;
  terminalCursorStyle: TerminalCursorStyle;
  terminalCursorBlink: boolean;
  /** OSC 52 clipboard *writes* (copy from tmux/vim/ssh). Reads are always
   * blocked in the handler regardless of this setting — see osc-handlers.ts. */
  terminalOsc52Clipboard: boolean;
  /** Ask before closing a terminal tab/pane whose shell is mid-command
   * (OSC 133 in-command). Without shell integration the check is silent. */
  terminalConfirmCloseBusy: boolean;
  /** Inline "✦ Explain" chip on commands that exit nonzero (needs OSC 133
   * shell integration, like the exit gutter). Clicking sends the command,
   * its output, and the cwd to the AI chat — see osc-handlers.ts. */
  terminalExplainFailures: boolean;
  toolApprovalPolicies: Record<string, ToolApprovalPolicy>;
  wordWrap: boolean;
  /** Open the ML Lab panel automatically when a training run starts. */
  mlAutoOpenOnTrain: boolean;
  /** Expansion packs currently enabled — see src/lib/packs.ts for the
   * taxonomy. Default is all packs on so upgrades change nothing. */
  enabledPacks: PackId[];
  /** Set once the first-run pack preset picker has been answered. */
  packsOnboarded: boolean;
  /** Debug status-bar readout of memory posture (slots/GL/scrollback/AI
   * history/recording). Development aid; polls only while enabled. */
  debugMemoryReport: boolean;
  /** Restore terminal scrollback on relaunch (persistent sessions Milestone
   * A). Only meaningful while restoreTabs is on. */
  terminalRestoreScrollback: boolean;
  /** Quick terminal: global-hotkey drop-down window. Off by default — it
   * claims a system-wide accelerator, which is not something to take without
   * being asked. */
  quickTerminalEnabled: boolean;
  /** Tauri accelerator that summons the quick terminal. */
  quickTerminalHotkey: string;
  /** Drop-down height as a fraction of the active monitor's height. */
  quickTerminalHeight: number;
  /** Hide the quick terminal when it loses focus (Ghostty's autohide). */
  quickTerminalHideOnBlur: boolean;
  /** Debug status-bar FPS meter (rAF-based main-thread jank readout).
   * Development aid; the rAF loop only runs while enabled. */
  debugFpsMeter: boolean;
};

const STORE_PATH = "nexis-settings.json";
const KEY_THEME = "theme";
const KEY_THEME_ID = "themeId";
const KEY_BG_KIND = "backgroundKind";
const KEY_BG_IMAGE_ID = "backgroundImageId";
const KEY_BG_ANIMATED_ID = "backgroundAnimatedId";
const KEY_BG_OPACITY = "backgroundOpacity";
const KEY_BG_BLUR = "backgroundBlur";
const KEY_DEFAULT_MODEL = "defaultModelId";
const KEY_EDITOR_THEME = "editorTheme";
const KEY_CUSTOM_INSTRUCTIONS = "customInstructions";
const KEY_AUTOSTART = "autostart";
const KEY_RESTORE_WINDOW = "restoreWindowState";
const KEY_RESTORE_TABS = "restoreTabs";
const KEY_AUTOCOMPLETE_ENABLED = "autocompleteEnabled";
const KEY_AUTOCOMPLETE_PROVIDER = "autocompleteProvider";
const KEY_AUTOCOMPLETE_MODEL = "autocompleteModelId";
const KEY_LMSTUDIO_BASE_URL = "lmstudioBaseURL";
const KEY_LMSTUDIO_MODEL_ID = "lmstudioModelId";
const KEY_MLX_BASE_URL = "mlxBaseURL";
const KEY_MLX_MODEL_ID = "mlxModelId";
const KEY_OLLAMA_BASE_URL = "ollamaBaseURL";
const KEY_OLLAMA_MODEL_ID = "ollamaModelId";
const KEY_VLLM_BASE_URL = "vllmBaseURL";
const KEY_VLLM_MODEL_ID = "vllmModelId";
const KEY_XLLM_BASE_URL = "xllmBaseURL";
const KEY_XLLM_MODEL_ID = "xllmModelId";
const KEY_SGLANG_BASE_URL = "sglangBaseURL";
const KEY_SGLANG_MODEL_ID = "sglangModelId";
const KEY_OPENAI_COMPAT_BASE_URL = "openaiCompatibleBaseURL";
const KEY_OPENAI_COMPAT_MODEL_ID = "openaiCompatibleModelId";
const KEY_OPENAI_COMPAT_CONTEXT_LIMIT = "openaiCompatibleContextLimit";
const KEY_FAVORITE_MODELS = "favoriteModelIds";
const KEY_RECENT_MODELS = "recentModelIds";
const KEY_VIM_MODE = "vimMode";
const KEY_SHOW_HIDDEN = "showHidden";
const LEGACY_KEY_SHOW_HIDDEN_DIRS = "showHiddenDirectories";
const KEY_TERMINAL_WEBGL_ENABLED = "terminalWebglEnabled";
const KEY_TERMINAL_FONT_FAMILY = "terminalFontFamily";
const KEY_TERMINAL_LETTER_SPACING = "terminalLetterSpacing";
const KEY_TERMINAL_FONT_SIZE = "terminalFontSize";
const KEY_TERMINAL_FONT_WEIGHT = "terminalFontWeight";
const KEY_DEFAULT_SHELL_PATH = "defaultShellPath";
const KEY_TERMINAL_SCROLLBACK = "terminalScrollback";
const KEY_LAST_WSL_DISTRO = "lastWslDistro";
const KEY_ZOOM_LEVEL = "zoomLevel";
const KEY_SHORTCUTS = "shortcuts";
const KEY_TERMINAL_ENV_VARS = "terminalEnvVars";
const KEY_FORMATTERS = "formatters";
const KEY_FORMAT_ON_SAVE = "formatOnSave";
const KEY_TERMINAL_SUGGESTIONS = "terminalSuggestionsEnabled";
const KEY_TERMINAL_CURSOR_STYLE = "terminalCursorStyle";
const KEY_TERMINAL_CURSOR_BLINK = "terminalCursorBlink";
const KEY_TERMINAL_OSC52_CLIPBOARD = "terminalOsc52Clipboard";
const KEY_TERMINAL_CONFIRM_CLOSE_BUSY = "terminalConfirmCloseBusy";
const KEY_TERMINAL_EXPLAIN_FAILURES = "terminalExplainFailures";
const KEY_TOOL_APPROVAL_POLICIES = "toolApprovalPolicies";
const KEY_WORD_WRAP = "wordWrap";
const KEY_ML_AUTO_OPEN = "mlAutoOpenOnTrain";
const KEY_ENABLED_PACKS = "enabledPacks";
const KEY_PACKS_ONBOARDED = "packsOnboarded";
const KEY_DEBUG_MEMORY_REPORT = "debugMemoryReport";
const KEY_TERMINAL_RESTORE_SCROLLBACK = "terminalRestoreScrollback";
const KEY_QUICK_TERMINAL_ENABLED = "quickTerminalEnabled";
const KEY_QUICK_TERMINAL_HOTKEY = "quickTerminalHotkey";
const KEY_QUICK_TERMINAL_HEIGHT = "quickTerminalHeight";
const KEY_QUICK_TERMINAL_HIDE_ON_BLUR = "quickTerminalHideOnBlur";
const KEY_DEBUG_FPS_METER = "debugFpsMeter";

export const TERMINAL_FONT_SIZE_DEFAULT = 14;
export const TERMINAL_FONT_SIZE_MIN = 8;
export const TERMINAL_FONT_SIZE_MAX = 32;

export const TERMINAL_FONT_SIZES = [
  10, 12, 13, 14, 15, 16, 18, 20, 22, 24,
] as const;

export const TERMINAL_FONT_WEIGHT_DEFAULT = 400;
export const TERMINAL_FONT_WEIGHTS = [
  { value: 300, label: "Light" },
  { value: 400, label: "Normal" },
  { value: 500, label: "Medium" },
  { value: 600, label: "Semibold" },
  { value: 700, label: "Bold" },
] as const;

export const TERMINAL_SCROLLBACK_DEFAULT = 2000;
export const TERMINAL_SCROLLBACK_MIN = 200;
export const TERMINAL_SCROLLBACK_MAX = 50_000;
export const TERMINAL_SCROLLBACK_PRESETS = [
  500, 1000, 2000, 5000, 10_000, 25_000,
] as const;

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  themeId: DEFAULT_THEME_ID,
  backgroundKind: "none",
  backgroundImageId: null,
  backgroundAnimatedId: null,
  backgroundOpacity: 0.5,
  backgroundBlur: 0,
  defaultModelId: DEFAULT_MODEL_ID,
  editorTheme: "atomone",
  customInstructions: "",
  autostart: false,
  restoreWindowState: true,
  restoreTabs: true,
  autocompleteEnabled: false,
  autocompleteProvider: "cerebras",
  autocompleteModelId: DEFAULT_AUTOCOMPLETE_MODEL.cerebras ?? "",
  lmstudioBaseURL: LMSTUDIO_DEFAULT_BASE_URL,
  lmstudioModelId: "",
  mlxBaseURL: MLX_DEFAULT_BASE_URL,
  mlxModelId: "",
  ollamaBaseURL: OLLAMA_DEFAULT_BASE_URL,
  ollamaModelId: "",
  vllmBaseURL: VLLM_DEFAULT_BASE_URL,
  vllmModelId: "",
  xllmBaseURL: XLLM_DEFAULT_BASE_URL,
  xllmModelId: "",
  sglangBaseURL: SGLANG_DEFAULT_BASE_URL,
  sglangModelId: "",
  openaiCompatibleBaseURL: OPENAI_COMPATIBLE_DEFAULT_BASE_URL,
  openaiCompatibleModelId: "",
  openaiCompatibleContextLimit: 128_000,
  favoriteModelIds: [],
  recentModelIds: [],
  vimMode: false,
  showHidden: false,
  terminalWebglEnabled: true,
  terminalFontFamily: "",
  terminalLetterSpacing: 0,
  terminalFontSize: TERMINAL_FONT_SIZE_DEFAULT,
  terminalFontWeight: TERMINAL_FONT_WEIGHT_DEFAULT,
  defaultShellPath: "",
  terminalScrollback: TERMINAL_SCROLLBACK_DEFAULT,
  lastWslDistro: null,
  zoomLevel: 1.0,
  shortcuts: {} as Record<ShortcutId, KeyBinding[]>,
  terminalEnvVars: {},
  formatters: DEFAULT_FORMATTERS,
  formatOnSave: false,
  terminalSuggestionsEnabled: true,
  terminalCursorStyle: "bar",
  terminalCursorBlink: false,
  terminalOsc52Clipboard: true,
  terminalConfirmCloseBusy: true,
  terminalExplainFailures: true,
  toolApprovalPolicies: {},
  wordWrap: false,
  mlAutoOpenOnTrain: false,
  enabledPacks: [...PACK_IDS],
  packsOnboarded: false,
  debugMemoryReport: false,
  terminalRestoreScrollback: true,
  quickTerminalEnabled: false,
  quickTerminalHotkey: DEFAULT_QUICK_TERMINAL_HOTKEY,
  quickTerminalHeight: QUICK_TERMINAL_DEFAULT_HEIGHT,
  quickTerminalHideOnBlur: true,
  debugFpsMeter: false,
};

function mergeFormatters(
  saved: Partial<Record<FormatterLanguage, FormatterConfig>>,
): Record<FormatterLanguage, FormatterConfig> {
  const result = { ...DEFAULT_FORMATTERS };
  for (const [lang, cfg] of Object.entries(saved)) {
    if (lang in result && cfg) result[lang as FormatterLanguage] = cfg;
  }
  return result;
}

const store = new LazyStore(STORE_PATH, { defaults: {}, autoSave: 200 });

// LazyStore.onChange only fires within the writing process. The settings
// page lives in a separate webview, so writes there never reach the main
// window's subscribers. Mirror every setter through a Tauri event so any
// window can listen.
const PREFS_CHANGED_EVENT = "nexis://prefs-changed";

async function writePref<T>(key: string, value: T): Promise<void> {
  await store.set(key, value);
  await store.save();
  await emit(PREFS_CHANGED_EVENT, { key, value });
}

export async function loadPreferences(): Promise<Preferences> {
  // Single IPC roundtrip — fetching keys individually fans out to one
  // `plugin:store|get` per setting and is the dominant boot cost.
  const entries = await store.entries();
  const map = new Map<string, unknown>(entries);
  const get = <T>(k: string): T | undefined => map.get(k) as T | undefined;
  return {
    theme: get<ThemePref>(KEY_THEME) ?? DEFAULT_PREFERENCES.theme,
    themeId: get<string>(KEY_THEME_ID) ?? DEFAULT_PREFERENCES.themeId,
    backgroundKind:
      get<BackgroundKind>(KEY_BG_KIND) ?? DEFAULT_PREFERENCES.backgroundKind,
    backgroundImageId:
      get<string | null>(KEY_BG_IMAGE_ID) ??
      DEFAULT_PREFERENCES.backgroundImageId,
    backgroundAnimatedId:
      get<AnimatedBgId | null>(KEY_BG_ANIMATED_ID) ??
      DEFAULT_PREFERENCES.backgroundAnimatedId,
    backgroundOpacity: clampBgOpacity(
      get<number>(KEY_BG_OPACITY) ?? DEFAULT_PREFERENCES.backgroundOpacity,
    ),
    backgroundBlur: clampBlur(
      get<number>(KEY_BG_BLUR) ?? DEFAULT_PREFERENCES.backgroundBlur,
    ),
    defaultModelId:
      get<ModelId>(KEY_DEFAULT_MODEL) ?? DEFAULT_PREFERENCES.defaultModelId,
    editorTheme:
      get<EditorThemeId>(KEY_EDITOR_THEME) ?? DEFAULT_PREFERENCES.editorTheme,
    customInstructions:
      get<string>(KEY_CUSTOM_INSTRUCTIONS) ??
      DEFAULT_PREFERENCES.customInstructions,
    autostart: get<boolean>(KEY_AUTOSTART) ?? DEFAULT_PREFERENCES.autostart,
    restoreWindowState:
      get<boolean>(KEY_RESTORE_WINDOW) ??
      DEFAULT_PREFERENCES.restoreWindowState,
    restoreTabs:
      get<boolean>(KEY_RESTORE_TABS) ?? DEFAULT_PREFERENCES.restoreTabs,
    autocompleteEnabled:
      get<boolean>(KEY_AUTOCOMPLETE_ENABLED) ??
      DEFAULT_PREFERENCES.autocompleteEnabled,
    autocompleteProvider:
      get<AutocompleteProviderId>(KEY_AUTOCOMPLETE_PROVIDER) ??
      DEFAULT_PREFERENCES.autocompleteProvider,
    autocompleteModelId:
      get<string>(KEY_AUTOCOMPLETE_MODEL) ??
      DEFAULT_PREFERENCES.autocompleteModelId,
    lmstudioBaseURL:
      get<string>(KEY_LMSTUDIO_BASE_URL) ?? DEFAULT_PREFERENCES.lmstudioBaseURL,
    lmstudioModelId:
      get<string>(KEY_LMSTUDIO_MODEL_ID) ?? DEFAULT_PREFERENCES.lmstudioModelId,
    mlxBaseURL:
      get<string>(KEY_MLX_BASE_URL) ?? DEFAULT_PREFERENCES.mlxBaseURL,
    mlxModelId:
      get<string>(KEY_MLX_MODEL_ID) ?? DEFAULT_PREFERENCES.mlxModelId,
    ollamaBaseURL:
      get<string>(KEY_OLLAMA_BASE_URL) ?? DEFAULT_PREFERENCES.ollamaBaseURL,
    ollamaModelId:
      get<string>(KEY_OLLAMA_MODEL_ID) ?? DEFAULT_PREFERENCES.ollamaModelId,
    vllmBaseURL:
      get<string>(KEY_VLLM_BASE_URL) ?? DEFAULT_PREFERENCES.vllmBaseURL,
    vllmModelId:
      get<string>(KEY_VLLM_MODEL_ID) ?? DEFAULT_PREFERENCES.vllmModelId,
    xllmBaseURL:
      get<string>(KEY_XLLM_BASE_URL) ?? DEFAULT_PREFERENCES.xllmBaseURL,
    xllmModelId:
      get<string>(KEY_XLLM_MODEL_ID) ?? DEFAULT_PREFERENCES.xllmModelId,
    sglangBaseURL:
      get<string>(KEY_SGLANG_BASE_URL) ?? DEFAULT_PREFERENCES.sglangBaseURL,
    sglangModelId:
      get<string>(KEY_SGLANG_MODEL_ID) ?? DEFAULT_PREFERENCES.sglangModelId,
    openaiCompatibleBaseURL:
      get<string>(KEY_OPENAI_COMPAT_BASE_URL) ??
      DEFAULT_PREFERENCES.openaiCompatibleBaseURL,
    openaiCompatibleModelId:
      get<string>(KEY_OPENAI_COMPAT_MODEL_ID) ??
      DEFAULT_PREFERENCES.openaiCompatibleModelId,
    openaiCompatibleContextLimit:
      get<number>(KEY_OPENAI_COMPAT_CONTEXT_LIMIT) ??
      DEFAULT_PREFERENCES.openaiCompatibleContextLimit,
    favoriteModelIds:
      get<string[]>(KEY_FAVORITE_MODELS) ??
      DEFAULT_PREFERENCES.favoriteModelIds,
    recentModelIds:
      get<string[]>(KEY_RECENT_MODELS) ?? DEFAULT_PREFERENCES.recentModelIds,
    vimMode: get<boolean>(KEY_VIM_MODE) ?? DEFAULT_PREFERENCES.vimMode,
    showHidden:
      get<boolean>(KEY_SHOW_HIDDEN) ??
      get<boolean>(LEGACY_KEY_SHOW_HIDDEN_DIRS) ??
      DEFAULT_PREFERENCES.showHidden,
    terminalWebglEnabled:
      get<boolean>(KEY_TERMINAL_WEBGL_ENABLED) ??
      DEFAULT_PREFERENCES.terminalWebglEnabled,
    terminalFontFamily:
      get<string>(KEY_TERMINAL_FONT_FAMILY) ??
      DEFAULT_PREFERENCES.terminalFontFamily,
    terminalLetterSpacing:
      get<number>(KEY_TERMINAL_LETTER_SPACING) ??
      DEFAULT_PREFERENCES.terminalLetterSpacing,
    terminalFontSize:
      get<number>(KEY_TERMINAL_FONT_SIZE) ??
      DEFAULT_PREFERENCES.terminalFontSize,
    terminalFontWeight: clampFontWeight(
      get<number>(KEY_TERMINAL_FONT_WEIGHT) ??
        DEFAULT_PREFERENCES.terminalFontWeight,
    ),
    defaultShellPath:
      get<string>(KEY_DEFAULT_SHELL_PATH) ??
      DEFAULT_PREFERENCES.defaultShellPath,
    terminalScrollback: clampScrollback(
      get<number>(KEY_TERMINAL_SCROLLBACK) ??
        DEFAULT_PREFERENCES.terminalScrollback,
    ),
    lastWslDistro:
      get<string | null>(KEY_LAST_WSL_DISTRO) ??
      DEFAULT_PREFERENCES.lastWslDistro,
    zoomLevel: get<number>(KEY_ZOOM_LEVEL) ?? DEFAULT_PREFERENCES.zoomLevel,
    shortcuts:
      get<Record<ShortcutId, KeyBinding[]>>(KEY_SHORTCUTS) ??
      DEFAULT_PREFERENCES.shortcuts,
    terminalEnvVars:
      get<Record<string, string>>(KEY_TERMINAL_ENV_VARS) ??
      DEFAULT_PREFERENCES.terminalEnvVars,
    formatters: mergeFormatters(
      get<Partial<Record<FormatterLanguage, FormatterConfig>>>(KEY_FORMATTERS) ?? {},
    ),
    formatOnSave: get<boolean>(KEY_FORMAT_ON_SAVE) ?? DEFAULT_PREFERENCES.formatOnSave,
    terminalSuggestionsEnabled:
      get<boolean>(KEY_TERMINAL_SUGGESTIONS) ??
      DEFAULT_PREFERENCES.terminalSuggestionsEnabled,
    terminalCursorStyle:
      get<TerminalCursorStyle>(KEY_TERMINAL_CURSOR_STYLE) ??
      DEFAULT_PREFERENCES.terminalCursorStyle,
    terminalCursorBlink:
      get<boolean>(KEY_TERMINAL_CURSOR_BLINK) ??
      DEFAULT_PREFERENCES.terminalCursorBlink,
    terminalOsc52Clipboard:
      get<boolean>(KEY_TERMINAL_OSC52_CLIPBOARD) ??
      DEFAULT_PREFERENCES.terminalOsc52Clipboard,
    terminalConfirmCloseBusy:
      get<boolean>(KEY_TERMINAL_CONFIRM_CLOSE_BUSY) ??
      DEFAULT_PREFERENCES.terminalConfirmCloseBusy,
    terminalExplainFailures:
      get<boolean>(KEY_TERMINAL_EXPLAIN_FAILURES) ??
      DEFAULT_PREFERENCES.terminalExplainFailures,
    toolApprovalPolicies:
      get<Record<string, ToolApprovalPolicy>>(KEY_TOOL_APPROVAL_POLICIES) ??
      DEFAULT_PREFERENCES.toolApprovalPolicies,
    wordWrap: get<boolean>(KEY_WORD_WRAP) ?? DEFAULT_PREFERENCES.wordWrap,
    mlAutoOpenOnTrain:
      get<boolean>(KEY_ML_AUTO_OPEN) ?? DEFAULT_PREFERENCES.mlAutoOpenOnTrain,
    // Unknown ids (renamed/removed packs in an older or newer config) are
    // dropped rather than kept as dead entries.
    enabledPacks: (
      get<string[]>(KEY_ENABLED_PACKS) ?? DEFAULT_PREFERENCES.enabledPacks
    ).filter(isPackId),
    packsOnboarded:
      get<boolean>(KEY_PACKS_ONBOARDED) ?? DEFAULT_PREFERENCES.packsOnboarded,
    debugMemoryReport:
      get<boolean>(KEY_DEBUG_MEMORY_REPORT) ??
      DEFAULT_PREFERENCES.debugMemoryReport,
    terminalRestoreScrollback:
      get<boolean>(KEY_TERMINAL_RESTORE_SCROLLBACK) ??
      DEFAULT_PREFERENCES.terminalRestoreScrollback,
    quickTerminalEnabled:
      get<boolean>(KEY_QUICK_TERMINAL_ENABLED) ??
      DEFAULT_PREFERENCES.quickTerminalEnabled,
    quickTerminalHotkey:
      get<string>(KEY_QUICK_TERMINAL_HOTKEY) ??
      DEFAULT_PREFERENCES.quickTerminalHotkey,
    quickTerminalHeight:
      get<number>(KEY_QUICK_TERMINAL_HEIGHT) ??
      DEFAULT_PREFERENCES.quickTerminalHeight,
    quickTerminalHideOnBlur:
      get<boolean>(KEY_QUICK_TERMINAL_HIDE_ON_BLUR) ??
      DEFAULT_PREFERENCES.quickTerminalHideOnBlur,
    debugFpsMeter:
      get<boolean>(KEY_DEBUG_FPS_METER) ?? DEFAULT_PREFERENCES.debugFpsMeter,
  };
}

export async function setTheme(value: ThemePref): Promise<void> {
  await writePref(KEY_THEME, value);
}

export async function setThemeId(value: string): Promise<void> {
  await writePref(KEY_THEME_ID, value);
}

/** Slider stores 0..1. Actual rendered opacity is halved in SurfaceLayer
 *  so the image never exceeds 50% — keeps UI/terminal readable at any setting. */
export const BG_OPACITY_RENDER_FACTOR = 0.5;

function clampBgOpacity(v: number): number {
  if (!Number.isFinite(v)) return 0.7;
  return Math.min(1, Math.max(0, v));
}

function clampBlur(v: number): number {
  if (!Number.isFinite(v)) return 16;
  return Math.min(64, Math.max(0, Math.round(v)));
}

export async function setBackgroundKind(value: BackgroundKind): Promise<void> {
  await writePref(KEY_BG_KIND, value);
}

export async function setBackgroundImageId(value: string | null): Promise<void> {
  await writePref(KEY_BG_IMAGE_ID, value);
}

export async function setBackgroundAnimatedId(value: AnimatedBgId | null): Promise<void> {
  await writePref(KEY_BG_ANIMATED_ID, value);
}

export async function setBackgroundOpacity(value: number): Promise<void> {
  await writePref(KEY_BG_OPACITY, clampBgOpacity(value));
}

export async function setBackgroundBlur(value: number): Promise<void> {
  await writePref(KEY_BG_BLUR, clampBlur(value));
}

export async function setDefaultModel(value: ModelId): Promise<void> {
  await writePref(KEY_DEFAULT_MODEL, value);
}

export async function setEditorTheme(value: EditorThemeId): Promise<void> {
  await writePref(KEY_EDITOR_THEME, value);
}

export async function setCustomInstructions(value: string): Promise<void> {
  await writePref(KEY_CUSTOM_INSTRUCTIONS, value);
}

export async function setAutostart(value: boolean): Promise<void> {
  await writePref(KEY_AUTOSTART, value);
}

export async function setRestoreWindowState(value: boolean): Promise<void> {
  await writePref(KEY_RESTORE_WINDOW, value);
}

export async function setRestoreTabs(value: boolean): Promise<void> {
  await writePref(KEY_RESTORE_TABS, value);
}

export async function setQuickTerminalEnabled(value: boolean): Promise<void> {
  await writePref(KEY_QUICK_TERMINAL_ENABLED, value);
}

export async function setQuickTerminalHotkey(value: string): Promise<void> {
  await writePref(KEY_QUICK_TERMINAL_HOTKEY, value);
}

export async function setQuickTerminalHeight(value: number): Promise<void> {
  await writePref(KEY_QUICK_TERMINAL_HEIGHT, clampQuickTerminalHeight(value));
}

export async function setQuickTerminalHideOnBlur(
  value: boolean,
): Promise<void> {
  await writePref(KEY_QUICK_TERMINAL_HIDE_ON_BLUR, value);
}

export async function setAutocompleteEnabled(value: boolean): Promise<void> {
  await writePref(KEY_AUTOCOMPLETE_ENABLED, value);
}

export async function setAutocompleteProvider(
  value: AutocompleteProviderId,
): Promise<void> {
  await writePref(KEY_AUTOCOMPLETE_PROVIDER, value);
}

export async function setAutocompleteModelId(value: string): Promise<void> {
  await writePref(KEY_AUTOCOMPLETE_MODEL, value);
}

export async function setLmstudioBaseURL(value: string): Promise<void> {
  await writePref(KEY_LMSTUDIO_BASE_URL, value);
}

export async function setLmstudioModelId(value: string): Promise<void> {
  await writePref(KEY_LMSTUDIO_MODEL_ID, value);
}

export async function setMlxBaseURL(value: string): Promise<void> {
  await writePref(KEY_MLX_BASE_URL, value);
}

export async function setMlxModelId(value: string): Promise<void> {
  await writePref(KEY_MLX_MODEL_ID, value);
}

export async function setOllamaBaseURL(value: string): Promise<void> {
  await writePref(KEY_OLLAMA_BASE_URL, value);
}

export async function setOllamaModelId(value: string): Promise<void> {
  await writePref(KEY_OLLAMA_MODEL_ID, value);
}

export async function setVllmBaseURL(value: string): Promise<void> {
  await writePref(KEY_VLLM_BASE_URL, value);
}

export async function setVllmModelId(value: string): Promise<void> {
  await writePref(KEY_VLLM_MODEL_ID, value);
}

export async function setXllmBaseURL(value: string): Promise<void> {
  await writePref(KEY_XLLM_BASE_URL, value);
}

export async function setXllmModelId(value: string): Promise<void> {
  await writePref(KEY_XLLM_MODEL_ID, value);
}

export async function setSglangBaseURL(value: string): Promise<void> {
  await writePref(KEY_SGLANG_BASE_URL, value);
}

export async function setSglangModelId(value: string): Promise<void> {
  await writePref(KEY_SGLANG_MODEL_ID, value);
}

export async function setOpenaiCompatibleBaseURL(value: string): Promise<void> {
  await writePref(KEY_OPENAI_COMPAT_BASE_URL, value);
}

export async function setOpenaiCompatibleModelId(value: string): Promise<void> {
  await writePref(KEY_OPENAI_COMPAT_MODEL_ID, value);
}

export async function setOpenaiCompatibleContextLimit(
  value: number,
): Promise<void> {
  const clamped = Number.isFinite(value)
    ? Math.max(1_000, Math.round(value))
    : DEFAULT_PREFERENCES.openaiCompatibleContextLimit;
  await writePref(KEY_OPENAI_COMPAT_CONTEXT_LIMIT, clamped);
}

export async function setFavoriteModelIds(value: string[]): Promise<void> {
  await writePref(KEY_FAVORITE_MODELS, value);
}

export async function setRecentModelIds(value: string[]): Promise<void> {
  await writePref(KEY_RECENT_MODELS, value);
}

export async function setVimMode(value: boolean): Promise<void> {
  await writePref(KEY_VIM_MODE, value);
}

export async function setShowHidden(value: boolean): Promise<void> {
  await writePref(KEY_SHOW_HIDDEN, value);
}

export async function setTerminalWebglEnabled(value: boolean): Promise<void> {
  await writePref(KEY_TERMINAL_WEBGL_ENABLED, value);
}

export async function setTerminalFontFamily(value: string): Promise<void> {
  await writePref(KEY_TERMINAL_FONT_FAMILY, value.trim());
}

export async function setTerminalLetterSpacing(value: number): Promise<void> {
  const clamped = Number.isFinite(value) ? Math.max(-10, Math.min(10, Math.round(value))) : 0;
  await writePref(KEY_TERMINAL_LETTER_SPACING, clamped);
}

export async function setTerminalFontSize(value: number): Promise<void> {
  const clamped = Number.isFinite(value)
    ? Math.min(
        TERMINAL_FONT_SIZE_MAX,
        Math.max(TERMINAL_FONT_SIZE_MIN, Math.round(value)),
      )
    : TERMINAL_FONT_SIZE_DEFAULT;
  await writePref(KEY_TERMINAL_FONT_SIZE, clamped);
}

function clampFontWeight(v: number): number {
  if (!Number.isFinite(v)) return TERMINAL_FONT_WEIGHT_DEFAULT;
  return Math.min(900, Math.max(100, Math.round(v / 100) * 100));
}

export async function setTerminalFontWeight(value: number): Promise<void> {
  await writePref(KEY_TERMINAL_FONT_WEIGHT, clampFontWeight(value));
}

export async function setDefaultShellPath(value: string): Promise<void> {
  await writePref(KEY_DEFAULT_SHELL_PATH, value.trim());
}

function clampScrollback(value: number): number {
  if (!Number.isFinite(value)) return TERMINAL_SCROLLBACK_DEFAULT;
  return Math.min(
    TERMINAL_SCROLLBACK_MAX,
    Math.max(TERMINAL_SCROLLBACK_MIN, Math.round(value)),
  );
}

export async function setTerminalScrollback(value: number): Promise<void> {
  await writePref(KEY_TERMINAL_SCROLLBACK, clampScrollback(value));
}

export async function setLastWslDistro(value: string | null): Promise<void> {
  await writePref(KEY_LAST_WSL_DISTRO, value);
}

export async function setZoomLevel(value: number): Promise<void> {
  await writePref(KEY_ZOOM_LEVEL, value);
}

export async function setShortcuts(
  value: Record<ShortcutId, KeyBinding[]> | {},
): Promise<void> {
  await writePref(KEY_SHORTCUTS, value);
}

export async function resetShortcuts(): Promise<void> {
  await writePref(KEY_SHORTCUTS, DEFAULT_PREFERENCES.shortcuts);
}

export async function setTerminalEnvVars(
  value: Record<string, string>,
): Promise<void> {
  await writePref(KEY_TERMINAL_ENV_VARS, value);
}

export async function setTerminalSuggestionsEnabled(value: boolean): Promise<void> {
  await writePref(KEY_TERMINAL_SUGGESTIONS, value);
}

export async function setTerminalCursorStyle(
  value: TerminalCursorStyle,
): Promise<void> {
  await writePref(KEY_TERMINAL_CURSOR_STYLE, value);
}

export async function setTerminalCursorBlink(value: boolean): Promise<void> {
  await writePref(KEY_TERMINAL_CURSOR_BLINK, value);
}

export async function setTerminalOsc52Clipboard(value: boolean): Promise<void> {
  await writePref(KEY_TERMINAL_OSC52_CLIPBOARD, value);
}

export async function setTerminalConfirmCloseBusy(value: boolean): Promise<void> {
  await writePref(KEY_TERMINAL_CONFIRM_CLOSE_BUSY, value);
}

export async function setTerminalExplainFailures(value: boolean): Promise<void> {
  await writePref(KEY_TERMINAL_EXPLAIN_FAILURES, value);
}

export async function setToolApprovalPolicies(
  value: Record<string, ToolApprovalPolicy>,
): Promise<void> {
  await writePref(KEY_TOOL_APPROVAL_POLICIES, value);
}

export async function setFormatters(
  value: Record<FormatterLanguage, FormatterConfig>,
): Promise<void> {
  await writePref(KEY_FORMATTERS, value);
}

export async function setFormatOnSave(value: boolean): Promise<void> {
  await writePref(KEY_FORMAT_ON_SAVE, value);
}

export async function setWordWrap(value: boolean): Promise<void> {
  await writePref(KEY_WORD_WRAP, value);
}

export async function setMlAutoOpenOnTrain(value: boolean): Promise<void> {
  await writePref(KEY_ML_AUTO_OPEN, value);
}

export async function setEnabledPacks(packs: PackId[]): Promise<void> {
  await writePref(KEY_ENABLED_PACKS, packs);
}

export async function setPacksOnboarded(value: boolean): Promise<void> {
  await writePref(KEY_PACKS_ONBOARDED, value);
}

export async function setDebugMemoryReport(value: boolean): Promise<void> {
  await writePref(KEY_DEBUG_MEMORY_REPORT, value);
}

export async function setTerminalRestoreScrollback(
  value: boolean,
): Promise<void> {
  await writePref(KEY_TERMINAL_RESTORE_SCROLLBACK, value);
}

export async function setDebugFpsMeter(value: boolean): Promise<void> {
  await writePref(KEY_DEBUG_FPS_METER, value);
}

export type PrefKey = keyof Preferences;

/** Subscribe to changes from any window (settings → main). */
export async function onPreferencesChange(
  cb: (key: PrefKey, value: unknown) => void,
): Promise<UnlistenFn> {
  const map: Record<string, PrefKey> = {
    [KEY_THEME]: "theme",
    [KEY_THEME_ID]: "themeId",
    [KEY_BG_KIND]: "backgroundKind",
    [KEY_BG_IMAGE_ID]: "backgroundImageId",
    [KEY_BG_ANIMATED_ID]: "backgroundAnimatedId",
    [KEY_BG_OPACITY]: "backgroundOpacity",
    [KEY_BG_BLUR]: "backgroundBlur",
    [KEY_DEFAULT_MODEL]: "defaultModelId",
    [KEY_EDITOR_THEME]: "editorTheme",
    [KEY_CUSTOM_INSTRUCTIONS]: "customInstructions",
    [KEY_AUTOSTART]: "autostart",
    [KEY_RESTORE_WINDOW]: "restoreWindowState",
    [KEY_RESTORE_TABS]: "restoreTabs",
    [KEY_AUTOCOMPLETE_ENABLED]: "autocompleteEnabled",
    [KEY_AUTOCOMPLETE_PROVIDER]: "autocompleteProvider",
    [KEY_AUTOCOMPLETE_MODEL]: "autocompleteModelId",
    [KEY_LMSTUDIO_BASE_URL]: "lmstudioBaseURL",
    [KEY_LMSTUDIO_MODEL_ID]: "lmstudioModelId",
    [KEY_MLX_BASE_URL]: "mlxBaseURL",
    [KEY_MLX_MODEL_ID]: "mlxModelId",
    [KEY_OLLAMA_BASE_URL]: "ollamaBaseURL",
    [KEY_OLLAMA_MODEL_ID]: "ollamaModelId",
    [KEY_VLLM_BASE_URL]: "vllmBaseURL",
    [KEY_VLLM_MODEL_ID]: "vllmModelId",
    [KEY_XLLM_BASE_URL]: "xllmBaseURL",
    [KEY_XLLM_MODEL_ID]: "xllmModelId",
    [KEY_SGLANG_BASE_URL]: "sglangBaseURL",
    [KEY_SGLANG_MODEL_ID]: "sglangModelId",
    [KEY_OPENAI_COMPAT_BASE_URL]: "openaiCompatibleBaseURL",
    [KEY_OPENAI_COMPAT_MODEL_ID]: "openaiCompatibleModelId",
    [KEY_OPENAI_COMPAT_CONTEXT_LIMIT]: "openaiCompatibleContextLimit",
    [KEY_FAVORITE_MODELS]: "favoriteModelIds",
    [KEY_RECENT_MODELS]: "recentModelIds",
    [KEY_VIM_MODE]: "vimMode",
    [KEY_SHOW_HIDDEN]: "showHidden",
    [KEY_TERMINAL_WEBGL_ENABLED]: "terminalWebglEnabled",
    [KEY_TERMINAL_FONT_FAMILY]: "terminalFontFamily",
    [KEY_TERMINAL_LETTER_SPACING]: "terminalLetterSpacing",
    [KEY_TERMINAL_FONT_SIZE]: "terminalFontSize",
    [KEY_TERMINAL_FONT_WEIGHT]: "terminalFontWeight",
    [KEY_DEFAULT_SHELL_PATH]: "defaultShellPath",
    [KEY_TERMINAL_SCROLLBACK]: "terminalScrollback",
    [KEY_LAST_WSL_DISTRO]: "lastWslDistro",
    [KEY_ZOOM_LEVEL]: "zoomLevel",
    [KEY_SHORTCUTS]: "shortcuts",
    [KEY_TERMINAL_ENV_VARS]: "terminalEnvVars",
    [KEY_TERMINAL_SUGGESTIONS]: "terminalSuggestionsEnabled",
    [KEY_TERMINAL_CURSOR_STYLE]: "terminalCursorStyle",
    [KEY_TERMINAL_CURSOR_BLINK]: "terminalCursorBlink",
    [KEY_TERMINAL_OSC52_CLIPBOARD]: "terminalOsc52Clipboard",
    [KEY_TERMINAL_CONFIRM_CLOSE_BUSY]: "terminalConfirmCloseBusy",
    [KEY_TERMINAL_EXPLAIN_FAILURES]: "terminalExplainFailures",
    [KEY_TOOL_APPROVAL_POLICIES]: "toolApprovalPolicies",
    [KEY_FORMATTERS]: "formatters",
    [KEY_FORMAT_ON_SAVE]: "formatOnSave",
    [KEY_WORD_WRAP]: "wordWrap",
    [KEY_ML_AUTO_OPEN]: "mlAutoOpenOnTrain",
    [KEY_ENABLED_PACKS]: "enabledPacks",
    [KEY_PACKS_ONBOARDED]: "packsOnboarded",
    [KEY_DEBUG_MEMORY_REPORT]: "debugMemoryReport",
    [KEY_TERMINAL_RESTORE_SCROLLBACK]: "terminalRestoreScrollback",
    [KEY_QUICK_TERMINAL_ENABLED]: "quickTerminalEnabled",
    [KEY_QUICK_TERMINAL_HOTKEY]: "quickTerminalHotkey",
    [KEY_QUICK_TERMINAL_HEIGHT]: "quickTerminalHeight",
    [KEY_QUICK_TERMINAL_HIDE_ON_BLUR]: "quickTerminalHideOnBlur",
    [KEY_DEBUG_FPS_METER]: "debugFpsMeter",
  };
  // Same-process writes still fire onChange immediately; cross-window writes
  // arrive via the Tauri event emitted by writePref().
  const unsubLocal = await store.onChange<unknown>((key, value) => {
    const mapped = map[key];
    if (mapped) cb(mapped, value);
  });
  const unsubEvent = await listen<{ key: string; value: unknown }>(
    PREFS_CHANGED_EVENT,
    (e) => {
      const mapped = map[e.payload.key];
      if (mapped) cb(mapped, e.payload.value);
    },
  );
  return () => {
    unsubLocal();
    unsubEvent();
  };
}

// API key changes are stored in OS keychain (not the prefs store),
// so we broadcast via a Tauri event for cross-window listeners.
const KEYS_CHANGED_EVENT = "nexis://ai-keys-changed";

export async function emitKeysChanged(): Promise<void> {
  await emit(KEYS_CHANGED_EVENT);
}

export function onKeysChanged(cb: () => void): Promise<UnlistenFn> {
  return listen(KEYS_CHANGED_EVENT, () => cb());
}
