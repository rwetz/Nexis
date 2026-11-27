// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The welcome-background library: a folder of looping backgrounds on the web
 * (the rwetz/nexis-backgrounds GitHub repository) with an index.json at its
 * root. Same shape as Nexis Press's shader library (rwetz/press-shaders).
 *
 * index.json:
 *   { "format": 1, "backgrounds": [{ "id", "name", "version", "collection",
 *     "description", "kind": "video", "path", "bytes", "sha256" }] }
 *
 * `path` is the folder holding `loop.mp4` and `poster.jpg`, relative to the
 * library's root. Each version gets its own folder
 * (backgrounds/<id>/<version>), so a published version never changes under
 * anyone, which is what lets the index pin a sha256.
 *
 * A background is only ever data: an H.264 loop played by a muted <video>
 * and a JPEG poster. Nothing downloaded is executed, so the library can't
 * reach the PTY, the filesystem or the AI tools. The loop is checked against
 * the index's byte count and SHA-256 and sniffed for an MP4 `ftyp` box before
 * it is stored. Installed backgrounds live in IndexedDB as Blobs, shared by
 * every Nexis window (same origin), and announced across windows with
 * {@link BACKGROUNDS_CHANGED_EVENT}.
 */

import { emit, listen, type UnlistenFn } from "@/platform/events";

export const LIBRARY_URL = "https://raw.githubusercontent.com/rwetz/nexis-backgrounds/main";
export const LIBRARY_PAGE = "https://github.com/rwetz/nexis-backgrounds";
export const FORMAT = 1;
/** Refuse anything bigger: a library loop is ~10 MB. */
export const MAX_BYTES = 64 * 1024 * 1024;
const MAX_POSTER_BYTES = 2 * 1024 * 1024;
/** Prefix a library background's id carries in the welcomeBackgroundId pref. */
export const LIB_PREFIX = "lib:";
export const BACKGROUNDS_CHANGED_EVENT = "nexis://welcome-backgrounds-changed";

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const SHA_RE = /^[0-9a-f]{64}$/;

export class LibraryError extends Error {}

export type LibraryEntry = {
  id: string;
  name: string;
  version: string;
  collection: string;
  description: string;
  kind: "video";
  path: string;
  bytes: number;
  sha256: string;
};

export type InstalledBackground = {
  id: string;
  name: string;
  version: string;
  collection: string;
  description: string;
  video: Blob;
  poster: Blob | null;
  installed: number;
};

/** What a list needs: everything but the video Blob. */
export type InstalledSummary = Omit<InstalledBackground, "video">;

export const libraryPrefId = (id: string): `lib:${string}` => `lib:${id}`;
export const isLibraryPrefId = (v: unknown): v is `lib:${string}` =>
  typeof v === "string" && v.startsWith(LIB_PREFIX) && ID_RE.test(v.slice(LIB_PREFIX.length));

// ── Index ───────────────────────────────────────────────────────────────────

function validEntry(e: unknown): e is LibraryEntry {
  const x = e as Partial<LibraryEntry> | null;
  return (
    !!x &&
    typeof x.id === "string" &&
    ID_RE.test(x.id) &&
    typeof x.name === "string" &&
    x.name.length > 0 &&
    typeof x.version === "string" &&
    VERSION_RE.test(x.version) &&
    x.kind === "video" &&
    typeof x.path === "string" &&
    // Relative, inside the library: no traversal, no scheme, no host.
    /^[A-Za-z0-9._/-]+$/.test(x.path) &&
    !x.path.split("/").includes("..") &&
    !x.path.startsWith("/") &&
    typeof x.bytes === "number" &&
    x.bytes > 0 &&
    x.bytes <= MAX_BYTES &&
    typeof x.sha256 === "string" &&
    SHA_RE.test(x.sha256)
  );
}

/** Checks a parsed index.json. Entries this Nexis can't use are left out. */
export function parseIndex(raw: unknown): LibraryEntry[] {
  const r = raw as { format?: unknown; backgrounds?: unknown } | null;
  if (r?.format !== FORMAT || !Array.isArray(r.backgrounds)) {
    throw new LibraryError(`The library uses index format ${String(r?.format)}; this Nexis reads ${FORMAT}.`);
  }
  return r.backgrounds.filter(validEntry).map((e) => ({
    ...e,
    collection: typeof e.collection === "string" ? e.collection : "",
    description: typeof e.description === "string" ? e.description : "",
  }));
}

async function get(url: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-cache" });
  } catch {
    throw new LibraryError("The background library can't be reached. Check your connection and try again.");
  }
  if (!res.ok) throw new LibraryError(`The library answered ${res.status} for ${url.split("/").slice(-2).join("/")}.`);
  return res;
}

export async function fetchIndex(base = LIBRARY_URL): Promise<LibraryEntry[]> {
  const res = await get(`${base}/index.json`);
  let raw: unknown;
  try {
    raw = JSON.parse(await res.text());
  } catch {
    throw new LibraryError("The library's index.json isn't valid JSON.");
  }
  return parseIndex(raw);
}

export const posterUrl = (e: LibraryEntry, base = LIBRARY_URL) => `${base}/${e.path}/poster.jpg`;

// ── Verification ────────────────────────────────────────────────────────────

/** An ISO-BMFF file (MP4) opens with a box whose type is `ftyp`. */
export function looksLikeMp4(head: Uint8Array): boolean {
  return head.length >= 8 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70;
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Throws unless `buf` is exactly the file the index describes. */
export async function verifyLoop(buf: ArrayBuffer, entry: LibraryEntry): Promise<void> {
  if (buf.byteLength !== entry.bytes) {
    throw new LibraryError(`${entry.name}: expected ${entry.bytes} bytes, got ${buf.byteLength}.`);
  }
  if (!looksLikeMp4(new Uint8Array(buf, 0, Math.min(16, buf.byteLength)))) {
    throw new LibraryError(`${entry.name}: the download isn't an MP4 video.`);
  }
  if ((await sha256Hex(buf)) !== entry.sha256) {
    throw new LibraryError(`${entry.name}: the download doesn't match the library's checksum.`);
  }
}

/** Reads a response body with a byte ceiling and progress. */
async function readCapped(res: Response, cap: number, onProgress?: (received: number) => void): Promise<ArrayBuffer> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > cap) throw new LibraryError("The download is larger than the library allows.");
  if (!res.body) {
    const buf = await res.arrayBuffer();
    if (buf.byteLength > cap) throw new LibraryError("The download is larger than the library allows.");
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > cap) {
      void reader.cancel();
      throw new LibraryError("The download is larger than the library allows.");
    }
    chunks.push(value);
    onProgress?.(received);
  }
  const out = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out.buffer;
}

// ── Storage ─────────────────────────────────────────────────────────────────

const DB_NAME = "nexis-welcome-backgrounds";
const STORE = "backgrounds";
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => {
        if (dbPromise === p) dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB blocked by another window"));
  }).catch((e) => {
    if (dbPromise === p) dbPromise = null;
    throw e;
  });
  dbPromise = p;
  return p;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        let result: T | undefined;
        const req = run(t.objectStore(STORE));
        if (req) req.onsuccess = () => (result = req.result);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export async function getInstalled(id: string): Promise<InstalledBackground | null> {
  return ((await tx<InstalledBackground>("readonly", (s) => s.get(id))) as InstalledBackground | undefined) ?? null;
}

export async function listInstalled(): Promise<InstalledSummary[]> {
  const all = ((await tx<InstalledBackground[]>("readonly", (s) => s.getAll())) ?? []) as InstalledBackground[];
  return all
    .map(({ video: _video, ...rest }) => rest)
    .sort((a, b) => a.collection.localeCompare(b.collection) || a.name.localeCompare(b.name));
}

async function announce(): Promise<void> {
  try {
    await emit(BACKGROUNDS_CHANGED_EVENT);
  } catch {
    // Outside Tauri (tests, a plain browser): this window already knows.
  }
}

export function onBackgroundsChanged(cb: () => void): Promise<UnlistenFn> {
  return listen(BACKGROUNDS_CHANGED_EVENT, () => cb()).catch(() => () => {});
}

/** Downloads one background, verifies it, and stores it. */
export async function install(
  entry: LibraryEntry,
  onProgress?: (fraction: number) => void,
  base = LIBRARY_URL,
): Promise<void> {
  const dir = `${base}/${entry.path}`;
  const res = await get(`${dir}/loop.mp4`);
  const buf = await readCapped(res, Math.min(MAX_BYTES, entry.bytes), (n) => onProgress?.(n / entry.bytes));
  await verifyLoop(buf, entry);
  let poster: Blob | null = null;
  try {
    const p = await get(`${dir}/poster.jpg`);
    const pb = await readCapped(p, MAX_POSTER_BYTES);
    const h = new Uint8Array(pb, 0, Math.min(3, pb.byteLength));
    if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) poster = new Blob([pb], { type: "image/jpeg" });
  } catch {
    // A poster is a nicety; the loop is the background.
  }
  const record: InstalledBackground = {
    id: entry.id,
    name: entry.name,
    version: entry.version,
    collection: entry.collection,
    description: entry.description,
    video: new Blob([buf], { type: "video/mp4" }),
    poster,
    installed: Date.now(),
  };
  try {
    await tx("readwrite", (s) => {
      s.put(record);
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      throw new LibraryError("Not enough storage to keep this background. Remove one you don't use and try again.");
    }
    throw e;
  }
  await announce();
}

export async function uninstall(id: string): Promise<void> {
  await tx("readwrite", (s) => {
    s.delete(id);
  });
  await announce();
}

/** Index entries newer than what's installed. */
export function updatesFor(index: LibraryEntry[], have: InstalledSummary[]): LibraryEntry[] {
  return index.filter((e) => {
    const h = have.find((x) => x.id === e.id);
    return !!h && compareVersions(e.version, h.version) > 0;
  });
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
