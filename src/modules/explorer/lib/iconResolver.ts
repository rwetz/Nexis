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

const dataUrlCache = new Map<string, string>();

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

function svgDataUrl(body: string, width: number, height: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${body}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildDataUrl(iconName: string): string | null {
  const key = `cat:${iconName}`;
  const cached = dataUrlCache.get(key);
  if (cached !== undefined) return cached || null;
  // Don't cache a miss while the JSON is still loading — `cat` is null until
  // the async import resolves, and caching "" here would poison the lookup so
  // the icon never appears even after load (the broken-box bug).
  if (!cat) return null;
  const body = catBody(iconName);
  if (!body) {
    dataUrlCache.set(key, "");
    return null;
  }
  const url = svgDataUrl(body, CAT_W, CAT_H);
  dataUrlCache.set(key, url);
  return url;
}

function buildVscDataUrl(iconName: string): string | null {
  const key = `vsc:${iconName}`;
  const cached = dataUrlCache.get(key);
  if (cached !== undefined) return cached || null;
  // Same as buildDataUrl: don't poison the cache while the set is loading.
  if (!vsc) return null;
  const body = vsc.icons[iconName]?.body;
  if (!body) {
    dataUrlCache.set(key, "");
    return null;
  }
  const url = svgDataUrl(body, VSC_W, VSC_H);
  dataUrlCache.set(key, url);
  return url;
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
function vscFolderUrl(name: string): string | null {
  if (!vsc) return null;
  const aliased = VSC_FOLDER_ALIASES[name];
  const slug = aliased ?? name.replace(/^\.+/, "");
  if (!slug) return null;
  return buildVscDataUrl(`folder-type-${slug}`);
}

function extOf(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.indexOf(".");
  if (dot === -1 || dot === lower.length - 1) return "";
  return lower.slice(dot + 1);
}

export function fileIconUrl(name: string): string {
  const lower = name.toLowerCase();

  const byName = catFileNames[lower];
  if (byName) {
    const url = buildDataUrl(byName);
    if (url) return url;
  }

  let ext = extOf(lower);
  while (ext) {
    const iconName = catFileExtensions[ext];
    if (iconName) {
      const url = buildDataUrl(iconName);
      if (url) return url;
    }
    const langId = EXT_TO_LANGUAGE_ID[ext];
    if (langId) {
      const iconByLang = catLanguageIds[langId];
      if (iconByLang) {
        const url = buildDataUrl(iconByLang);
        if (url) return url;
      }
    }
    const nextDot = ext.indexOf(".");
    if (nextDot === -1) break;
    ext = ext.slice(nextDot + 1);
  }

  return buildDataUrl(DEFAULT_FILE) ?? "";
}

export function folderIconUrl(name: string, expanded: boolean): string {
  const lower = name.toLowerCase();

  const mapped = catFolderNames[lower];
  if (mapped) {
    const slug = toIconifySlug(mapped);
    const target = expanded ? `${slug}-open` : slug;
    const url = buildDataUrl(target);
    if (url) return url;
  }

  // Fall through to vscode-icons for ecosystems catppuccin doesn't cover.
  // The pruned set carries no "-opened" variants — same art either state.
  const vscUrl = vscFolderUrl(lower);
  if (vscUrl) return vscUrl;

  return buildDataUrl(expanded ? DEFAULT_FOLDER_OPEN : DEFAULT_FOLDER) ?? "";
}

// Exported for callers that want to know icons are ready before first render.
export function preloadIcons(): Promise<void> {
  return ensureLoaded();
}
