// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { fileIconUrl, folderIconUrl, preloadIcons } from "./iconResolver";

function decoded(url: string): string {
  return decodeURIComponent(url.replace(/^data:image\/svg\+xml;utf8,/, ""));
}

// The resolver loads its icon sets via fetch() of Vite `?url` asset imports.
// In the node test environment those resolve to dev-server paths ("/src/…",
// "/@fs/…") that fetch can't reach — serve them from disk instead.
function assetUrlToFsPath(u: string): string {
  const clean = u.split("?")[0];
  if (clean.startsWith("/@fs/")) return clean.slice("/@fs".length);
  return path.join(process.cwd(), clean.replace(/^\//, ""));
}

beforeAll(async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const bytes = await readFile(assetUrlToFsPath(String(input)));
    return new Response(bytes);
  }) as typeof fetch;
  await preloadIcons();
});

describe("folderIconUrl — catppuccin primary", () => {
  it("maps a known folder name and changes art when expanded", () => {
    const closed = folderIconUrl("src", false);
    const open = folderIconUrl("src", true);
    expect(closed).toMatch(/^data:image\/svg\+xml/);
    expect(open).toMatch(/^data:image\/svg\+xml/);
    expect(closed).not.toBe(open);
  });

  it("keeps the deliberate mobile→android approximation", () => {
    expect(folderIconUrl("mobile", false)).toBe(folderIconUrl("android", false));
  });

  it("falls back to the default folder icon for unknown names", () => {
    const unknown = folderIconUrl("zzz-no-such-ecosystem", false);
    expect(unknown).toBe(folderIconUrl("", false));
  });
});

describe("folderIconUrl — vscode-icons fallback", () => {
  it("serves ecosystems catppuccin lacks from the 32x32 vscode set", () => {
    const kotlin = folderIconUrl("kotlin", false);
    expect(kotlin).toMatch(/^data:image\/svg\+xml/);
    expect(decoded(kotlin)).toContain('viewBox="0 0 32 32"');
    // Not the default folder.
    expect(kotlin).not.toBe(folderIconUrl("zzz-no-such-ecosystem", false));
  });

  it("aliases dotnet and .nuget onto the NuGet art, jvm onto Maven", () => {
    const dotnet = folderIconUrl("dotnet", false);
    expect(dotnet).toBe(folderIconUrl(".nuget", false));
    expect(decoded(dotnet)).toContain('viewBox="0 0 32 32"');

    const jvm = folderIconUrl("jvm", false);
    expect(decoded(jvm)).toContain('viewBox="0 0 32 32"');
    expect(jvm).not.toBe(dotnet);
  });

  it("reuses closed art for the expanded state (no -opened variants shipped)", () => {
    expect(folderIconUrl("kotlin", true)).toBe(folderIconUrl("kotlin", false));
  });

  it("strips leading dots before matching the vscode set", () => {
    expect(folderIconUrl(".expo", false)).toBe(folderIconUrl("expo", false));
  });
});

describe("fileIconUrl", () => {
  it("resolves known extensions and falls back to the generic file icon", () => {
    const rust = fileIconUrl("main.rs");
    const generic = fileIconUrl("blob.zzz9");
    expect(rust).toMatch(/^data:image\/svg\+xml/);
    expect(generic).toMatch(/^data:image\/svg\+xml/);
    expect(rust).not.toBe(generic);
  });

  it("walks compound extensions down to the last segment", () => {
    // "backup.rs" has no dedicated icon → the walk falls through to "rs".
    expect(fileIconUrl("data.backup.rs")).toBe(fileIconUrl("main.rs"));
  });

  it("prefers a dedicated compound-extension icon over the plain one", () => {
    // catppuccin ships a distinct *.test.ts glyph — it must win over "ts".
    expect(fileIconUrl("foo.test.ts")).not.toBe(fileIconUrl("bar.ts"));
  });
});
