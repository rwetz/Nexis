// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { EXT_TO_LANGUAGE_ID } from "./constants";
import * as fileIconsMod from "./fileIcons";
import * as folderIconsMod from "./folderIcons";
// `?url` emits the JSONs as plain assets and imports only their URL strings —
// the data is fetched and parsed with the native JSON parser below instead of
// being compiled into (and executed as) a ~750 KB of JS module chunks.
import catIconsUrl from "@iconify-json/catppuccin/icons.json?url";
import vscIconsUrl from "./vscodeFolderIcons.json?url";

const catFileNames = fileIconsMod.fileNames as Record<string, string>;
const catFileExtensions = fileIconsMod.fileExtensions as Record<string, string>;
const catLanguageIds = fileIconsMod.languageIds as Record<string, string>;
const catFolderNames = folderIconsMod.folderNames as Record<string, string>;

type IconifySet = {
  icons: Record<string, { body: string }>;
  aliases?: Record<string, { parent: string }>;
  width?: number;
  height?: number;
};

let cat: IconifySet | null = null;
let CAT_W = 16;
let CAT_H = 16;

// Secondary folder-icon set: a pruned @iconify-json/vscode-icons subset
// (folder-type-* only, see scripts/generate-vscode-folder-icons.mjs).
// Used when catppuccin has no folder match — it has purpose-built art for
// ecosystems catppuccin lacks (NuGet, Maven, iOS, Flutter, Electron, …).
let vsc: IconifySet | null = null;
let VSC_W = 32;
let VSC_H = 32;

// Lazy-load the icon JSONs off the critical path.
async function fetchIconSet(url: string): Promise<IconifySet> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`icon set ${url}: HTTP ${res.status}`);
  return (await res.json()) as IconifySet;
}

let loadPromise: Promise<void> | null = null;
function ensureLoaded(): Promise<void> {
  if (cat && vsc) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = Promise.all([
    fetchIconSet(catIconsUrl).then((data) => {
      cat = data;
      CAT_W = data.width ?? 16;
      CAT_H = data.height ?? 16;
    }),
    fetchIconSet(vscIconsUrl).then((data) => {
      vsc = data;
      VSC_W = data.width ?? 32;
      VSC_H = data.height ?? 32;
    }),
  ])
    .then(() => {})
    .catch((e) => {
      // Allow a retry on the next preloadIcons() call instead of caching the
      // rejection forever (same lesson as pitfall #10).
      loadPromise = null;
      console.warn("[nexis] icon set load failed:", e);
    });
  return loadPromise;
}

// Kick off the load immediately (but non-blocking) so the JSON is ready
// before the file tree is visible in most cases.
void ensureLoaded();

const DEFAULT_FILE = "file";
const DEFAULT_FOLDER = "folder";
const DEFAULT_FOLDER_OPEN = "folder-open";

/**
 * Catppuccin Macchiato → the active theme's own palette.
 *
 * The whole 659-icon set is drawn from exactly 19 hex values, so retinting it
 * is a lookup rather than art work. This exists because the icons were shipping
 * Catppuccin's palette into all six original Nexis themes: open Aurelian (warm
 * gold over umber) and the file tree was still lilac and macchiato blue,
 * because the art had colours baked in that no theme could reach.
 *
 * Each accent maps to the *same hue role* in the target palette — blue stays
 * blue, red stays red — so a language is still identifiable at a glance; only
 * the specific shade becomes the theme's. Every Nexis theme ships a full
 * 16-colour ANSI palette (see `applyTheme.ts`), which is what makes the target
 * side of this map guaranteed to exist.
 *
 * These substitute to `var(...)` rather than resolved colours, which is why the
 * art has to be inlined into the document instead of served as a `data:` URL —
 * a data URL is an isolated document and the page's custom properties do not
 * cascade into it. Inlining also means a theme switch recolours the tree with
 * no cache to invalidate and no re-render to force.
 */
const CAT_TO_THEME: Record<string, string> = {
  "#cad3f5": "--terminal-foreground", // text
  "#8aadf4": "--terminal-ansi-blue", // blue
  "#eed49f": "--terminal-ansi-yellow", // yellow
  "#a6da95": "--terminal-ansi-green", // green
  "#8087a2": "--terminal-ansi-bright-black", // overlay1
  "#f5a97f": "--terminal-ansi-bright-yellow", // peach
  "#ed8796": "--terminal-ansi-red", // red
  "#c6a0f6": "--terminal-ansi-magenta", // mauve
  "#91d7e3": "--terminal-ansi-bright-cyan", // sky
  "#7dc4e4": "--terminal-ansi-cyan", // sapphire
  "#f5bde6": "--terminal-ansi-bright-magenta", // pink
  "#8bd5ca": "--terminal-ansi-bright-green", // teal
  "#ee99a0": "--terminal-ansi-bright-red", // maroon
  "#b7bdf8": "--terminal-ansi-bright-blue", // lavender
  "#f4dbd6": "--terminal-ansi-bright-white", // rosewater
  "#f0c6c6": "--terminal-ansi-bright-red", // flamingo
  "#fff": "--terminal-ansi-bright-white",
  "#3700ff": "--terminal-ansi-blue",
  "#df8e1d": "--terminal-ansi-yellow",
};

const CAT_HEX_RE = new RegExp(
  `(?:${Object.keys(CAT_TO_THEME)
    .sort((a, b) => b.length - a.length) // longest first: #fff must not eat #f5a97f
    .join("|")})(?![0-9a-fA-F])`, // and must not eat the head of a longer hex
  "gi",
);

/**
 * Retint a catppuccin icon body onto the active theme.
 *
 * The vscode-icons fallback set is deliberately *not* passed through here — its
 * entries are brand marks (NuGet, Maven, Flutter), and a brand mark recoloured
 * to fit a theme is just a wrong logo.
 */
function retint(body: string): string {
  return body.replace(
    CAT_HEX_RE,
    (m) => `var(${CAT_TO_THEME[m.toLowerCase()]})`,
  );
}

/** Inline-able icon art: an SVG inner body plus the viewBox it is drawn for. */
export type IconArt = { body: string; width: number; height: number };

const artCache = new Map<string, IconArt | null>();

// Catppuccin's manifest emits names like `folder_src`/`typescript-react`, but
// the iconify export normalizes everything to hyphenated slugs.
function toIconifySlug(name: string): string {
  return name.replace(/_/g, "-");
}

function catBody(iconName: string): string | null {
  if (!cat) return null;
  const slug = toIconifySlug(iconName);
  const direct = cat.icons[slug];
  if (direct) return direct.body;
  const alias = cat.aliases?.[slug];
  if (alias) {
    const parent = cat.icons[alias.parent];
    if (parent) return parent.body;
  }
  return null;
}

function buildArt(iconName: string): IconArt | null {
  const key = `cat:${iconName}`;
  const cached = artCache.get(key);
  if (cached !== undefined) return cached;
  // Don't cache a miss while the JSON is still loading — `cat` is null until
  // the async import resolves, and caching null here would poison the lookup so
  // the icon never appears even after load (the broken-box bug).
  if (!cat) return null;
  const body = catBody(iconName);
  if (!body) {
    artCache.set(key, null);
    return null;
  }
  const art: IconArt = { body: retint(body), width: CAT_W, height: CAT_H };
  artCache.set(key, art);
  return art;
}

function buildVscArt(iconName: string): IconArt | null {
  const key = `vsc:${iconName}`;
  const cached = artCache.get(key);
  if (cached !== undefined) return cached;
  // Same as buildArt: don't poison the cache while the set is loading.
  if (!vsc) return null;
  const body = vsc.icons[iconName]?.body;
  if (!body) {
    artCache.set(key, null);
    return null;
  }
  // Brand art keeps its own colours — see `retint`.
  const art: IconArt = { body, width: VSC_W, height: VSC_H };
  artCache.set(key, art);
  return art;
}

/**
 * Folder names whose best available art lives in the vscode-icons set under
 * a different slug than the folder name itself.
 */
const VSC_FOLDER_ALIASES: Record<string, string> = {
  dotnet: "nuget",
  ".nuget": "nuget",
  jvm: "maven",
  ".maven": "maven",
  ".m2": "maven",
  kt: "kotlin",
  notebook: "notebooks",
};

/** vscode-icons fallback for a folder name; null when the set has no match. */
function vscFolderArt(name: string): IconArt | null {
  if (!vsc) return null;
  const aliased = VSC_FOLDER_ALIASES[name];
  const slug = aliased ?? name.replace(/^\.+/, "");
  if (!slug) return null;
  return buildVscArt(`folder-type-${slug}`);
}

function extOf(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.indexOf(".");
  if (dot === -1 || dot === lower.length - 1) return "";
  return lower.slice(dot + 1);
}

export function fileIconArt(name: string): IconArt | null {
  const lower = name.toLowerCase();

  const byName = catFileNames[lower];
  if (byName) {
    const art = buildArt(byName);
    if (art) return art;
  }

  let ext = extOf(lower);
  while (ext) {
    const iconName = catFileExtensions[ext];
    if (iconName) {
      const art = buildArt(iconName);
      if (art) return art;
    }
    const langId = EXT_TO_LANGUAGE_ID[ext];
    if (langId) {
      const iconByLang = catLanguageIds[langId];
      if (iconByLang) {
        const art = buildArt(iconByLang);
        if (art) return art;
      }
    }
    const nextDot = ext.indexOf(".");
    if (nextDot === -1) break;
    ext = ext.slice(nextDot + 1);
  }

  return buildArt(DEFAULT_FILE);
}

export function folderIconArt(name: string, expanded: boolean): IconArt | null {
  const lower = name.toLowerCase();

  const mapped = catFolderNames[lower];
  if (mapped) {
    const slug = toIconifySlug(mapped);
    const target = expanded ? `${slug}-open` : slug;
    const art = buildArt(target);
    if (art) return art;
  }

  // Fall through to vscode-icons for ecosystems catppuccin doesn't cover.
  // The pruned set carries no "-opened" variants — same art either state.
  const vscArt = vscFolderArt(lower);
  if (vscArt) return vscArt;

  return buildArt(expanded ? DEFAULT_FOLDER_OPEN : DEFAULT_FOLDER);
}

// Exported for callers that want to know icons are ready before first render.
export function preloadIcons(): Promise<void> {
  return ensureLoaded();
}
