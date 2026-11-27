// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  compareVersions,
  isLibraryPrefId,
  LibraryError,
  libraryPrefId,
  looksLikeMp4,
  MAX_BYTES,
  parseIndex,
  sha256Hex,
  updatesFor,
  verifyLoop,
  type LibraryEntry,
} from "./backgroundLibrary";
import { isWelcomeBgId, nextWelcomeBg } from "@/modules/settings/store";

const SHA = "a".repeat(64);
const entry = (over: Partial<LibraryEntry> = {}): LibraryEntry => ({
  id: "wisp-fen",
  name: "Wisp Fen",
  version: "1.0.0",
  collection: "Drowned Places",
  description: "A drowned chapel",
  kind: "video",
  path: "backgrounds/wisp-fen/1.0.0",
  bytes: 1024,
  sha256: SHA,
  ...over,
});

/** A minimal buffer that opens like an MP4: size, then `ftyp`. */
function mp4(size: number): ArrayBuffer {
  const b = new Uint8Array(size);
  b.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  for (let i = 12; i < size; i++) b[i] = i % 251;
  return b.buffer;
}

describe("parseIndex", () => {
  it("rejects an index of another format", () => {
    expect(() => parseIndex({ format: 2, backgrounds: [] })).toThrow(LibraryError);
    expect(() => parseIndex(null)).toThrow(LibraryError);
  });

  it("keeps valid entries and drops the rest", () => {
    const out = parseIndex({
      format: 1,
      backgrounds: [
        entry(),
        entry({ id: "Bad Id" }),
        entry({ id: "escape", path: "backgrounds/../../etc" }),
        entry({ id: "abs", path: "/backgrounds/x" }),
        entry({ id: "scheme", path: "https://evil.example/x" }),
        entry({ id: "huge", bytes: MAX_BYTES + 1 }),
        entry({ id: "nosha", sha256: "xyz" }),
        { ...entry({ id: "code" }), kind: "script" },
        entry({ id: "ver", version: "latest" }),
      ],
    });
    expect(out.map((e) => e.id)).toEqual(["wisp-fen"]);
  });

  it("fills a missing collection and description with empty strings", () => {
    const { collection: _c, description: _d, ...bare } = entry();
    const [e] = parseIndex({ format: 1, backgrounds: [bare] });
    expect(e.collection).toBe("");
    expect(e.description).toBe("");
  });
});

describe("verifyLoop", () => {
  it("accepts exactly the file the index describes", async () => {
    const buf = mp4(1024);
    await expect(verifyLoop(buf, entry({ sha256: await sha256Hex(buf) }))).resolves.toBeUndefined();
  });

  it("rejects a wrong size, a non-MP4 and a checksum mismatch", async () => {
    const buf = mp4(1024);
    const sha = await sha256Hex(buf);
    await expect(verifyLoop(buf, entry({ bytes: 1000, sha256: sha }))).rejects.toThrow(/expected 1000 bytes/);
    const html = new TextEncoder().encode("<html><script>".padEnd(1024, " ")).buffer as ArrayBuffer;
    await expect(verifyLoop(html, entry({ sha256: await sha256Hex(html) }))).rejects.toThrow(/isn't an MP4/);
    await expect(verifyLoop(buf, entry({ sha256: SHA }))).rejects.toThrow(/checksum/);
  });

  it("sniffs the ftyp box", () => {
    expect(looksLikeMp4(new Uint8Array(mp4(16)))).toBe(true);
    expect(looksLikeMp4(new Uint8Array([0, 0, 0, 0, 0x6d, 0x6f, 0x6f, 0x76]))).toBe(false);
    expect(looksLikeMp4(new Uint8Array(4))).toBe(false);
  });
});

describe("versions", () => {
  it("compares numerically", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.9.9", "1.0.0")).toBeLessThan(0);
  });

  it("lists only installed backgrounds with a newer version", () => {
    const have = [{ id: "wisp-fen", name: "", version: "1.0.0", collection: "", description: "", poster: null, installed: 0 }];
    expect(updatesFor([entry({ version: "1.1.0" }), entry({ id: "other" })], have).map((e) => e.id)).toEqual([
      "wisp-fen",
    ]);
    expect(updatesFor([entry()], have)).toEqual([]);
  });
});

describe("welcome background preference", () => {
  it("accepts built-ins and library ids, nothing else", () => {
    expect(isWelcomeBgId("ward")).toBe(true);
    expect(isWelcomeBgId("darkveil")).toBe(true);
    expect(isWelcomeBgId(libraryPrefId("wisp-fen"))).toBe(true);
    expect(isLibraryPrefId("lib:../x")).toBe(false);
    expect(isWelcomeBgId("dotgrid")).toBe(false);
    expect(isWelcomeBgId(undefined)).toBe(false);
  });

  it("rotates through the built-ins, then the installed library", () => {
    const lib = [libraryPrefId("a"), libraryPrefId("b")];
    expect(nextWelcomeBg("ward", lib)).toBe("darkveil");
    expect(nextWelcomeBg("darkveil", lib)).toBe("lib:a");
    expect(nextWelcomeBg("lib:b", lib)).toBe("ward");
    expect(nextWelcomeBg("darkveil")).toBe("ward");
    // An uninstalled background restarts the rotation.
    expect(nextWelcomeBg("lib:gone", lib)).toBe("ward");
  });
});
